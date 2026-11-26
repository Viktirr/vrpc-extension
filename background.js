// Chrome support
if (typeof browser === 'undefined') {
  var browser = chrome;
}

const nativeHostName = "vrpc";
// Wire-protocol version; older apps ignore the unknown PROTO frame.
const CLIENT_PROTO = 2;
const MIN_APP_VERSION = "1.1.0";
const MIN_PROTO = 2;

// Don't hammer the host with launches if it keeps failing to start.
const reconnectIntervalMs = 10000;
const reconnectDelayMs = 1000;
// A forced restart waits this long before a new port is opened, because the old native host has
// to finish exiting and release its pid lock first.
const restartGraceMs = 3000;
// While another browser holds the app lock, only re-check this often.
const lockedRecheckMs = 30000;
// A process that stops answering for this long is treated as hung and replaced. Long enough that
// only a real hang is caught, not a slow start or a busy machine.
const heartbeatTimeoutMs = 120000;
// How often a connected app is probed. An open native messaging port keeps the service worker
// alive, so this timer does not need a separate wake-up permission.
const watchdogIntervalMs = 20000;
// Give the restarted app time to initialize Discord RPC before replaying song data.
const recoveryReplayDelayMs = 1500;

// Older builds marked an outdated app with a red "!" badge and the browser restores that badge
// text when the background page restarts, so clear it once for installs that still carry it.
try {
  const action = browser.action || browser.browserAction;
  if (action && action.setBadgeText) { action.setBadgeText({ text: "" }); }
} catch (e) {
  console.log("Couldn't clear the extension badge: " + e);
}

// Show the update notice once per installed extension version. The page also
// offers the opt-in "install updates automatically" switch, which is stored in
// the app's Config.json and read by the desktop updater.
const updateInfoPagePath = "new-update-page/update.html";
const updateInfoPageVersionKey = "vrpcUpdateInfoPageVersion";

function OpenUpdateInfoPage() {
  try {
    browser.tabs.create({ url: browser.runtime.getURL(updateInfoPagePath) });
  } catch (e) {
    console.log("Couldn't open the VRPC update page: " + e);
  }
}

// The app stays running for as long as the browser does, even before a player page is opened.
browser.runtime.onStartup.addListener(StartAppAtStartup);

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install" && details.reason !== "update") { return; }

  const version = browser.runtime.getManifest().version;
  try {
    browser.storage.local.get(updateInfoPageVersionKey).then((stored) => {
      if (stored && stored[updateInfoPageVersionKey] === version) { return; }
      browser.storage.local.set({ [updateInfoPageVersionKey]: version });
      OpenUpdateInfoPage();
    }).catch(() => OpenUpdateInfoPage());
  } catch (e) {
    // A browser/storage failure must not hide the notice.
    OpenUpdateInfoPage();
  }
});

let port = null;
let lastConnectAttempt = 0;
let connectBlockedUntil = 0;
let lastLockedCheck = 0;
let hadLaunched = false;
let AppActive = false;
let appLocked = false;
let appVersion = null;
let appProtocol = 1;
let appOutdated = false;
let heartbeatTimer = null;
let watchdogTimer = null;
let reconnectTimer = null;
let startupTimer = null;
let recoveryPending = false;
let activeService = null;
let announcedService = null;
let lastRpcByService = Object.create(null);

function ParseVersion(value) {
  if (!value) { return null; }
  const match = String(value).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) { return null; }
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3] || "0", 10)];
}

function IsOlderVersion(value, minimum) {
  const left = ParseVersion(value);
  const right = ParseVersion(minimum);
  if (!left || !right) { return true; }
  for (let i = 0; i < 3; i++) {
    if (left[i] < right[i]) { return true; }
    if (left[i] > right[i]) { return false; }
  }
  return false;
}

// Lower app/protocol keeps working but gets a popup warning.
function UpdateCompatibility() {
  const outdated = IsOlderVersion(appVersion, MIN_APP_VERSION) || appProtocol < MIN_PROTO;
  if (outdated === appOutdated) { return; }
  appOutdated = outdated;
  if (outdated) { NotifyPopup("STATUS: APP_OUTDATED"); }
}

function NotifyPopup(content) {
  try {
    const result = browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: content
    });
    // No popup open means nobody is listening, which is not worth reporting.
    if (result && typeof result.catch === "function") { result.catch(() => { }); }
  } catch (e) {
    console.log("Couldn't notify the popup: " + e);
  }
}

function ClearHeartbeatTimer() {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function ClearWatchdogTimer() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

// Everything here describes the current port only; the next handshake rebuilds it.
function ResetAppState() {
  AppActive = false;
  appVersion = null;
  appProtocol = 1;
  appOutdated = false;
  announcedService = null;
  ClearHeartbeatTimer();
  ClearWatchdogTimer();
}

// Probes a connected app every 20 seconds so a process that hangs without closing its pipe is
// still noticed. The open native messaging port is what keeps this timer alive in MV3.
function StartWatchdog() {
  if (watchdogTimer || !port || appLocked) { return; }

  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    if (!port) {
      if (hadLaunched || activeService) { ScheduleReconnect("the app is not connected"); }
      return;
    }

    CheckAppHeartbeat();
    StartWatchdog();
  }, watchdogIntervalMs);
}

// Opens the native messaging port if it isn't open already. The port is created on demand, so a
// background page that was restarted (or a browser that lost the app) reconnects by itself
// instead of needing a browser restart.
function ConnectToApp() {
  if (port) { return port; }

  const now = Date.now();
  if (now < connectBlockedUntil) { return null; }
  if (now - lastConnectAttempt < reconnectIntervalMs) { return null; }
  lastConnectAttempt = now;

  try {
    port = browser.runtime.connectNative(nativeHostName);
  } catch (e) {
    console.log("Couldn't connect to the app: " + e);
    port = null;
    return null;
  }

  const currentPort = port;
  // Bind the handlers to this port so a late disconnect from an old connection cannot tear down
  // a newer one that was opened while the old host was shutting down.
  currentPort.onMessage.addListener(message => HandleAppMessage(currentPort, message));
  currentPort.onDisconnect.addListener(() => HandleAppDisconnect(currentPort));

  // Announce before asking for the version.
  try {
    currentPort.postMessage("PROTO: \n" + CLIENT_PROTO);
    currentPort.postMessage("Status: \nGET_APP_VERSION");
  } catch (e) {
    console.log("Couldn't announce the protocol: " + e);
    port = null;
    try { currentPort.disconnect(); } catch { }
    return null;
  }

  StartWatchdog();
  return currentPort;
}

// The app exited, crashed or was never installed: drop the port and try to start it again. A
// restart is only useful once something was listening, so recovery data is replayed after the
// next handshake rather than immediately.
function HandleAppDisconnect(disconnectedPort) {
  if (port !== disconnectedPort) { return; }

  const error = browser.runtime.lastError;
  console.log("Disconnected from the app" + (error ? ": " + error.message : ""));
  port = null;
  ResetAppState();
  if (hadLaunched || activeService) { recoveryPending = true; }
  if (!appLocked) { ScheduleReconnect("the app disconnected"); }
}

// Reopens the port after a short delay. The existing connect throttle is kept so a missing or
// broken install cannot turn into a launch storm.
function ScheduleReconnect(reason) {
  if (port || appLocked || reconnectTimer) { return; }

  const now = Date.now();
  const throttleWait = Math.max(0, reconnectIntervalMs - (now - lastConnectAttempt));
  const graceWait = Math.max(0, connectBlockedUntil - now);
  const delay = Math.max(reconnectDelayMs, throttleWait, graceWait);
  console.log(`[Watchdog] Scheduling a reconnect in ${delay} ms (${reason}).`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (port || appLocked) { return; }

    if (!ConnectToApp()) {
      ScheduleReconnect("the host did not start");
      return;
    }
    CheckAppHeartbeat();
  }, delay);
}

function SendToApp(message) {
  const currentPort = ConnectToApp();
  if (!currentPort) { return false; }

  try {
    currentPort.postMessage(message);
    return true;
  } catch (e) {
    // The port died between opening it and writing to it.
    console.log("Couldn't send to the app: " + e);
    if (port === currentPort) { port = null; }
    AppActive = false;
    ClearWatchdogTimer();
    try { currentPort.disconnect(); } catch { }
    ScheduleReconnect("a send failed");
    return false;
  }
}

// Player frames start with the service name; returns the split frame for a known service.
function SplitServiceFrame(content) {
  if (typeof content !== "string") { return null; }
  const lines = content.split("\n");
  const service = lines[0];
  return service === "YouTube Music" || service === "Soundcloud" ? lines : null;
}

function TrackServiceStatus(lines) {
  if (!lines) { return; }
  const [service, action] = lines;

  if (action === "Opened") {
    activeService = service;
  } else if (action === "Closed" && activeService === service) {
    activeService = null;
    delete lastRpcByService[service];
  }
}

function TrackRpcData(content) {
  const lines = SplitServiceFrame(content);
  if (lines) { lastRpcByService[lines[0]] = content; }
}

// Discord RPC is started by the service's "Opened" message, not by RPC data. Replaying both
// after a relaunch is what turns a new process into a working session instead of one that only
// answers heartbeats until the page is reloaded.
function RestoreActiveSession() {
  if (!recoveryPending) { return; }
  if (!activeService || !port) {
    recoveryPending = false;
    return;
  }
  if (appLocked) { return; }

  const service = activeService;
  const currentPort = port;
  recoveryPending = false;

  // A page restored from the back/forward cache may already have sent Opened to this connection.
  // Re-sending it makes the app wait on its duplicate-start guard (2 s) before it processes new
  // frames, so only arm a service that hasn't been announced on the current port.
  if (announcedService !== service) {
    console.log(`[Watchdog] Re-arming ${service} after the restart.`);
    try {
      currentPort.postMessage("Status: \n" + service + "\nOpened");
      announcedService = service;
    } catch (e) {
      console.log("Couldn't re-arm the app: " + e);
      return;
    }
  }

  const cachedRpc = lastRpcByService[service];
  if (!cachedRpc) { return; }

  // The app only forwards RPC updates after its Discord client has initialized. Replaying the
  // last frame once that has happened restores the current song even while it is paused.
  setTimeout(() => {
    if (port !== currentPort || appLocked || activeService !== service) { return; }
    if (lastRpcByService[service] !== cachedRpc) { return; }
    try {
      currentPort.postMessage("RPC: \n" + cachedRpc);
    } catch (e) {
      console.log("Couldn't replay the current song: " + e);
    }
  }, recoveryReplayDelayMs);
}

function HandleAppMessage(sourcePort, response) {
  if (port !== sourcePort) { return; }

  console.log("Received: " + response);
  if (typeof response !== "string") { return; }

  // Missing PROTO means an older app and defaults to 1.
  if (response.startsWith("APPVERSION: ")) {
    const raw = response.substring("APPVERSION: ".length);
    appVersion = raw.split(";")[0].trim();
    const protocolMatch = raw.match(/PROTO=(\d+)/i);
    appProtocol = protocolMatch ? parseInt(protocolMatch[1], 10) : 1;
    // Any reply proves the process is up, even if the heartbeat answer is still in flight.
    AppActive = true;
    hadLaunched = true;
    appLocked = false;
    ClearHeartbeatTimer();
    UpdateCompatibility();
    RestoreActiveSession();
  }

  if (response === "Alive") {
    AppActive = true;
    hadLaunched = true;
    appLocked = false;
    ClearHeartbeatTimer();
    NotifyPopup("STATUS: ALIVE");
    RestoreActiveSession();
    return;
  }
  if (response === "PROGRAM: LOCK")
  {
    AppActive = false;
    appLocked = true;
    hadLaunched = true;
    ClearHeartbeatTimer();
    NotifyPopup("STATUS: LOCKED");
    return;
  }
  NotifyPopup(response);
}

// A single timeout is shared by every heartbeat, so the popup's 4 second polling cannot keep
// postponing the deadline forever. Alive/version replies clear it.
function StartHeartbeatTimeout() {
  if (heartbeatTimer) { return; }

  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    if (AppActive || appLocked) { return; }
    NotifyPopup("STATUS: FAILED");
    RestartApp("the app stopped answering");
  }, heartbeatTimeoutMs);
}

function RestartApp(reason) {
  if (appLocked) { return; }

  console.log("[Watchdog] Restarting the app because " + reason + ".");
  ResetAppState();
  recoveryPending = true;
  connectBlockedUntil = Date.now() + restartGraceMs;

  const currentPort = port;
  port = null;
  if (currentPort) {
    // Closing the port makes the browser terminate the native host, including a hung one.
    try { currentPort.disconnect(); } catch (e) {
      console.log("Couldn't close the old app connection: " + e);
    }
  }

  // The port was detached before it was closed, so schedule the retry here. connectBlockedUntil
  // keeps every other launch path off the old host's pid file until it has exited.
  ScheduleReconnect(reason);
}

// Check if the app is running
function CheckAppHeartbeat() {
  if (appLocked) {
    // The browser holding the lock may have closed by now, so keep re-checking once in a while
    // instead of staying locked until this browser is restarted.
    const now = Date.now();
    if (now - lastLockedCheck < lockedRecheckMs) {
      NotifyPopup("STATUS: LOCKED");
      return;
    }
    lastLockedCheck = now;
  }

  // Only a fresh answer counts, otherwise one good heartbeat would hide a later crash.
  AppActive = false;

  console.log("Checking App Status");

  if (!SendToApp("Status: \nProgram\nHeartbeat")) {
    ScheduleReconnect("the app is not connected");
    return;
  }
  // Refresh compatibility on every heartbeat.
  SendToApp("Status: \nGET_APP_VERSION");
  StartHeartbeatTimeout();
}

function CheckLaunched() {
  if (appLocked == true) {
    return;
  }
  if (hadLaunched == false) {
    NotifyPopup("STATUS: NOT_LAUNCHED");
  }
  else {
    NotifyPopup("STATUS: CRASHED");
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_RPC_INFO") {
    TrackRpcData(message.content);
    SendToApp("RPC: \n" + message.content);
  } else if (message.type === "SET_STATUS_INFO") {
    console.log("Status Info: " + message.content);
    const lines = SplitServiceFrame(message.content);
    TrackServiceStatus(lines);
    if (SendToApp("Status: \n" + message.content)) {
      if (lines && lines[1] === "Opened") { announcedService = lines[0]; }
    }
  } else if (message.type === "GET_POPUP_INFO") {
    if (message.content === "CHECK_APP_HEARTBEAT") {
      CheckAppHeartbeat();
    }
    if (message.content === "CHECK_LAUNCHED") {
      CheckLaunched();
    }
  } else if (message.type === "SEND_TO_APP") {
    console.log("Sending to app... " + message.content);
    SendToApp("Status: \n" + message.content);
  } else if (message.type === "SET_UNATTENDED_UPDATES") {
    const ok = SendToApp("Status: \nSET_CONFIG\nUnattendedUpdates\n" + (message.enabled ? "true" : "false"));
    if (typeof sendResponse === "function") { sendResponse({ ok }); }
    return true;
  }
});

// Open the port as soon as the background starts, not only on the first player frame. The open
// port keeps the service worker alive and the app running, like the pre-reconnect builds did.
// The short delay lets a host from a reloaded worker release its pid lock first.
function StartAppAtStartup() {
  if (startupTimer || port) { return; }
  startupTimer = setTimeout(() => {
    startupTimer = null;
    lastConnectAttempt = 0;
    ConnectToApp();
  }, restartGraceMs);
}

StartAppAtStartup();

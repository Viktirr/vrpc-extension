// Chrome support
if (typeof browser === 'undefined') {
    var browser = chrome;
}

let isRPCRunning = false;
let isRPCShown = false;
let isScrollRunning = false;
let firstUpdate = true;
let hasLaunched = false;

let appSupportsUpdates = false;
let updatePollTimer = null;
let updateStatusTimer = null;
let updateStatus = null;
let updatePending = null;
let updateNotice = null;
let updateNoticeTimer = null;
let updateCheckExpiryTimer = null;
let lastUpdateStatusRequestAt = 0;

const manifest = browser.runtime.getManifest()
const versionNumber = manifest.version;
// Compatibility thresholds mirrored from background.js.
const MIN_APP_VERSION = "1.1.0";
const MIN_PROTO = 2;
// The updater shipped first in 1.1.0. The update commands are sent only after an APPVERSION reply
// proves the running app can answer them, so an older app never receives an unknown command.
const MIN_UPDATE_APP_VERSION = "1.1.0";
const UPDATE_POLL_INTERVAL_MS = 15000;
const UPDATE_REPLY_TIMEOUT_MS = 6000;

// Parses the version from an APPVERSION reply. Releases are strict numeric x.y.z; a plain x.y
// means x.y.0, and two-part legacy releases packed minor and patch into two digits ("1.01" is
// 1.0.1, never 1.1.0). Anything else, including dev suffixes such as "1.1.0-dev", is unparsable:
// those builds report no automatic-update support to the app itself.
function ParseVersion(value) {
    if (typeof value !== "string") { return null; }
    const text = value.trim();

    const legacy = text.match(/^(\d+)\.0(\d)$/);
    if (legacy) {
        return [parseInt(legacy[1], 10), 0, parseInt(legacy[2], 10)];
    }

    const match = text.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!match) { return null; }

    const parts = [match[1], match[2], match[3] || "0"];
    if (!parts.every((part) => /^(0|[1-9]\d*)$/.test(part))) { return null; }
    return parts.map((part) => parseInt(part, 10));
}

// An unparsable version is treated as older so every caller fails closed.
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

// Recomputes the warning panel height after revealing one of its sections.
function ShowWarning(id) {
    const container = document.getElementById("warning-container");
    const warning = document.getElementById(id);
    if (!container || !warning) { return; }
    warning.style.display = "block";
    container.style.height = document.getElementById("warning-container-data").offsetHeight + "px";
}

// Hides one section and collapses the panel when nothing else is showing. Only a version check
// may hide the outdated warning: a heartbeat says the app is alive, not that it is current.
function HideWarning(id) {
    const container = document.getElementById("warning-container");
    const warning = document.getElementById(id);
    if (!container || !warning) { return; }
    warning.style.display = "none";

    const sections = ["warning-crashed", "warning-not-launched", "warning-app-locked", "warning-app-outdated"];
    const anyVisible = sections.some((section) => {
        const element = document.getElementById(section);
        return element && element.style.display === "block";
    });
    container.style.height = anyVisible ? document.getElementById("warning-container-data").offsetHeight + "px" : "0px";
}

// --- Update panel --------------------------------------------------------------------------
// The app answers GET_UPDATE_STATUS with "UPDATESTATUS: <json>" and the two actions with
// "UPDATE: <result>". background.js forwards every unknown app reply to the popup unchanged, so
// no background change is needed. Nothing here is sent until an APPVERSION reply proves the app
// is new enough to understand the commands.

function SendUpdateCommand(content) {
    try {
        const result = browser.runtime.sendMessage({
            type: "SEND_TO_APP",
            content: content
        });
        if (result && typeof result.catch === "function") { result.catch(() => { }); }
    } catch (e) {
        console.log("[Popup] Couldn't send " + content + ": " + e);
    }
}

function FormatUpdateVersions(status) {
    if (!status) { return ""; }
    const parts = [];
    if (status.currentVersion) { parts.push("Installed " + status.currentVersion); }
    if (status.availableVersion) { parts.push("Available " + status.availableVersion); }
    return parts.join(" | ");
}

function SanitizeUpdateMessage(value) {
    if (typeof value !== "string") { return ""; }
    const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/[<>]/g, "").trim();
    return cleaned.length > 160 ? cleaned.substring(0, 157) + "..." : cleaned;
}

function SetUpdateNotice(text) {
    updateNotice = { text: text, until: Date.now() + 6000 };
}

function StartUpdatePolling(sendNow) {
    if (!appSupportsUpdates || updatePollTimer) { return; }
    if (sendNow) { RequestUpdateStatus(true); }
    updatePollTimer = setInterval(() => { RequestUpdateStatus(false); }, UPDATE_POLL_INTERVAL_MS);
}

function StopUpdatePolling() {
    if (updatePollTimer) { clearInterval(updatePollTimer); updatePollTimer = null; }
    if (updateStatusTimer) { clearTimeout(updateStatusTimer); updateStatusTimer = null; }
    if (updateCheckExpiryTimer) { clearTimeout(updateCheckExpiryTimer); updateCheckExpiryTimer = null; }
    updateStatus = null;
    updatePending = null;
    updateNotice = null;
    RenderUpdatePanel();
}

function RequestUpdateStatus(force) {
    if (!appSupportsUpdates) { return; }

    // A heartbeat reply may want a refresh too, but it must never turn the popup's 4 second
    // heartbeat into a burst of update requests.
    const now = Date.now();
    if (!force && now - lastUpdateStatusRequestAt < 5000) { return; }
    lastUpdateStatusRequestAt = now;

    SendUpdateCommand("GET_UPDATE_STATUS");
    if (updateStatusTimer) { clearTimeout(updateStatusTimer); }
    updateStatusTimer = setTimeout(() => {
        updateStatusTimer = null;
        // A launched installer stops this app, so "Installing" outlives the status connection.
        if (updatePending && updatePending.kind === "install") { return; }
        updatePending = null;
        updateStatus = null;
        RenderUpdatePanel();
    }, UPDATE_REPLY_TIMEOUT_MS);
}

function HandleUpdateStatus(content) {
    if (updateStatusTimer) { clearTimeout(updateStatusTimer); updateStatusTimer = null; }

    let status = null;
    try {
        status = JSON.parse(content.substring("UPDATESTATUS: ".length));
    } catch (e) {
        status = null;
    }
    if (!status || typeof status !== "object" || typeof status.phase !== "string") {
        updateStatus = null;
        RenderUpdatePanel();
        return;
    }

    // A reply proves the app understands the update command even if a version reply was missed.
    if (!appSupportsUpdates) {
        appSupportsUpdates = true;
        StartUpdatePolling(false);
    }

    updateStatus = status;
    if (updatePending) {
        if (updatePending.kind === "install") {
            if (status.phase !== "installing") { updatePending = null; }
        } else {
            const baseline = updatePending.baseline || "";
            const lastChecked = status.lastCheckedUtc || "";
            // Only a new check (or a phase beyond "checking") retires the optimistic state.
            if (lastChecked !== baseline || status.phase !== "idle") { updatePending = null; }
        }
    }
    RenderUpdatePanel();
}

function RequestUpdateCheck() {
    if (!appSupportsUpdates) { return; }
    if (updatePending && updatePending.kind === "install") { return; }

    updateNotice = null;
    updatePending = { kind: "check", baseline: (updateStatus && updateStatus.lastCheckedUtc) || "" };
    RenderUpdatePanel();
    SendUpdateCommand("UPDATE_CHECK");

    setTimeout(() => { RequestUpdateStatus(true); }, 1200);
    if (updateCheckExpiryTimer) { clearTimeout(updateCheckExpiryTimer); }
    updateCheckExpiryTimer = setTimeout(() => {
        updateCheckExpiryTimer = null;
        if (updatePending && updatePending.kind === "check") {
            updatePending = null;
            RenderUpdatePanel();
        }
    }, UPDATE_REPLY_TIMEOUT_MS + 4000);
}

function RequestUpdateInstall() {
    if (!appSupportsUpdates) { return; }
    if (updatePending && updatePending.kind === "install") { return; }

    updateNotice = null;
    updatePending = { kind: "install" };
    RenderUpdatePanel();
    SendUpdateCommand("UPDATE_INSTALL");
    setTimeout(() => { RequestUpdateStatus(true); }, 1500);
}

function HandleUpdateCommandReply(content) {
    const result = content.substring("UPDATE: ".length).trim();

    if (result === "accepted") {
        if (!updatePending || updatePending.kind !== "check") {
            updatePending = { kind: "check", baseline: (updateStatus && updateStatus.lastCheckedUtc) || "" };
        }
        RenderUpdatePanel();
        setTimeout(() => { RequestUpdateStatus(true); }, 700);
        return;
    }
    if (result === "installing") {
        updatePending = { kind: "install" };
        RenderUpdatePanel();
        setTimeout(() => { RequestUpdateStatus(true); }, 1500);
        return;
    }
    if (result === "rate_limited") {
        updatePending = null;
        SetUpdateNotice("You checked for updates recently. Please try again in a few minutes.");
        RenderUpdatePanel();
        return;
    }
    if (result === "not_ready") {
        updatePending = null;
        SetUpdateNotice("The update isn't ready yet. Please try again in a moment.");
        RenderUpdatePanel();
        setTimeout(() => { RequestUpdateStatus(true); }, 800);
        return;
    }
    if (result === "failed") {
        updatePending = null;
        SetUpdateNotice("The update couldn't be started. Please try again.");
        RenderUpdatePanel();
        setTimeout(() => { RequestUpdateStatus(true); }, 800);
        return;
    }
    if (result === "unsupported") {
        updatePending = null;
        SetUpdateNotice("Updates aren't available for this installation.");
        RenderUpdatePanel();
        setTimeout(() => { RequestUpdateStatus(true); }, 800);
        return;
    }

    // Unknown reply: let the next status poll decide what to show.
    updatePending = null;
    RenderUpdatePanel();
}

function BuildUpdateView() {
    let phase = null;
    if (updatePending && updatePending.kind === "install") {
        phase = "installing";
    } else if (updatePending && updatePending.kind === "check") {
        phase = "checking";
    } else if (updateStatus && typeof updateStatus.phase === "string") {
        phase = updateStatus.phase;
    }
    if (!phase) { return null; }

    const status = updateStatus || {};
    const notice = (updateNotice && Date.now() < updateNotice.until) ? updateNotice.text : "";
    const view = {
        title: "",
        note: "",
        versions: "",
        progressVisible: false,
        progressPercent: 0,
        installVisible: false,
        installDisabled: false,
        installLabel: "Update now",
        checkVisible: true,
        checkDisabled: false,
        checkLabel: "Check for updates",
        notesUrl: ""
    };

    switch (phase) {
        case "idle":
            view.title = "Up to date";
            if (status.currentVersion) { view.versions = "Installed " + status.currentVersion; }
            break;
        case "checking":
            view.title = "Checking for updates...";
            view.checkVisible = false;
            break;
        case "downloading":
            view.title = "Downloading update";
            view.versions = FormatUpdateVersions(status);
            view.progressVisible = true;
            view.progressPercent = Math.max(0, Math.min(100, Math.round(Number(status.progressPercent) || 0)));
            view.checkVisible = false;
            break;
        case "ready":
            view.title = "Update available";
            view.versions = FormatUpdateVersions(status);
            view.installVisible = true;
            break;
        case "installing":
            view.title = "Installing update...";
            view.note = "The VRPC app will restart. This popup can be closed.";
            view.installVisible = true;
            view.installDisabled = true;
            view.installLabel = "Installing...";
            view.checkVisible = false;
            break;
        case "failed":
            view.title = "Update check failed";
            view.note = SanitizeUpdateMessage(status.lastErrorMessage) || "Please try again later.";
            view.checkLabel = "Try again";
            break;
        case "not_installed":
            view.title = "Automatic updates unavailable";
            view.note = "VRPC is running from a release package, not from an installation. Install the release to get automatic updates.";
            view.checkVisible = false;
            break;
        case "unsupported":
            view.title = "Automatic updates unavailable";
            view.note = "This VRPC version does not support automatic updates.";
            view.checkVisible = false;
            break;
        case "disabled":
            view.title = "Automatic updates disabled";
            view.note = "Update checks are turned off in the VRPC app.";
            view.checkVisible = false;
            break;
        default:
            return null;
    }

    // A transient hint must not hide a definitive failed/unavailable message.
    if (notice && phase !== "failed" && phase !== "not_installed" && phase !== "unsupported" && phase !== "disabled") {
        view.note = notice;
    }

    if ((phase === "ready" || phase === "downloading" || phase === "installing") &&
        typeof status.notesUrl === "string" && status.notesUrl.startsWith("https://")) {
        view.notesUrl = status.notesUrl;
    }

    return view;
}

function RenderUpdatePanel() {
    const container = document.getElementById("update-container");
    const data = document.getElementById("update-container-data");
    if (!container || !data) { return; }

    const view = BuildUpdateView();
    if (!view) {
        container.style.height = "0px";
        container.style.visibility = "hidden";
        return;
    }

    const statusText = document.getElementById("update-status-text");
    if (statusText) { statusText.textContent = view.title; }

    const versionText = document.getElementById("update-version-text");
    if (versionText) {
        versionText.textContent = view.versions;
        versionText.style.display = view.versions ? "block" : "none";
    }

    const message = document.getElementById("update-message");
    if (message) {
        message.textContent = view.note;
        message.style.display = view.note ? "block" : "none";
    }

    const progress = document.getElementById("update-progress");
    if (progress) { progress.style.display = view.progressVisible ? "block" : "none"; }
    const progressFill = document.getElementById("update-progress-fill");
    if (progressFill) { progressFill.style.width = view.progressPercent + "%"; }
    const progressText = document.getElementById("update-progress-text");
    if (progressText) { progressText.textContent = view.progressPercent + "%"; }

    const installButton = document.getElementById("update-install-button");
    if (installButton) {
        installButton.textContent = view.installLabel;
        installButton.disabled = view.installDisabled;
        installButton.style.display = view.installVisible ? "inline-block" : "none";
    }

    const checkButton = document.getElementById("update-check-button");
    if (checkButton) {
        checkButton.textContent = view.checkLabel;
        checkButton.disabled = view.checkDisabled;
        checkButton.style.display = view.checkVisible ? "inline-block" : "none";
    }

    const notesContainer = document.getElementById("update-notes-container");
    const notesLink = document.getElementById("update-notes-link");
    if (notesContainer && notesLink) {
        if (view.notesUrl) {
            notesLink.setAttribute("href", view.notesUrl);
            notesContainer.style.display = "block";
        } else {
            notesContainer.style.display = "none";
        }
    }

    container.style.visibility = "visible";
    container.style.height = data.offsetHeight + "px";

    // The notice line is only a transient hint; the next status poll has the final word.
    if (updateNoticeTimer) { clearTimeout(updateNoticeTimer); updateNoticeTimer = null; }
    if (updateNotice) {
        const remaining = updateNotice.until - Date.now();
        if (remaining > 0) {
            updateNoticeTimer = setTimeout(() => {
                updateNotice = null;
                updateNoticeTimer = null;
                RenderUpdatePanel();
            }, remaining + 50);
        } else {
            updateNotice = null;
        }
    }
}

function OpenContainer(_container) {
    let _dataContainer = _container + "-data";
    let container = document.getElementById(_container);
    let dataContainer = document.getElementById(_dataContainer);

    if (container.classList.contains("closed")) {
        container.style.height = dataContainer.offsetHeight + "px";
        container.classList.remove("closed");
    } else {
        container.style.height = null;
        container.classList.add("closed");
    }
}

function SwitchToggle(_toggle) {
    let toggle = document.getElementById(_toggle);
    let currentOption = false;

    if (toggle.classList.contains("enabled")) {
        toggle.classList.remove("enabled");
        toggle.classList.add("disabled");
        currentOption = false;
    } else {
        toggle.classList.remove("disabled");
        toggle.classList.add("enabled");
        currentOption = true;
    }

    if (_toggle = "toggle-about") { SwitchAboutVisibility(currentOption); }
}

function GetRichPresence() {
    console.log("[Popup] Get RPC Info")
    browser.runtime.sendMessage({
        type: "SEND_TO_APP",
        content: "GET_RPC_INFO"
    });
}

function GetFullConfig() {
    console.log("[Popup] Get Full Config")
    browser.runtime.sendMessage({
        type: "SEND_TO_APP",
        content: "GET_CONFIG_FULL"
    });
}

function GetListeningDataStats() {
    console.log("[Popup] Get Listening Data Statistics")

    browser.runtime.sendMessage({
        type: "SEND_TO_APP",
        content: "GET_LISTENINGDATA"
    });
}

function ConvertIntoTimestamp(time) {
    let minutes = Math.floor(time / 60);
    let seconds = time % 60;

    if (seconds < 10) {
        time = minutes + ":0" + seconds;
    } else {
        time = minutes + ":" + seconds;
    }

    return time;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

isRegularCheckForRichPresenceRunning = false;
async function RegularlyCheckForRichPresence() {
    if (isRegularCheckForRichPresenceRunning == true) { return; }
    while (true) {
        isRegularCheckForRichPresenceRunning = true;
        await sleep(1000);
        browser.runtime.sendMessage({
            type: "SEND_TO_APP",
            content: "GET_RPC_INFO"
        });
    }
}

isRegularCheckForHeartbeatRunning = false;
gotHeartbeatResponse = false;
async function RegularlyCheckForHeartbeat() {
    if (isRegularCheckForHeartbeatRunning == true) { return; }
    while (true) {
        isRegularCheckForHeartbeatRunning = true;
        await sleep(4000);
        if (gotHeartbeatResponse == false) {
            document.getElementById("app-status").classList.remove("success");
            document.getElementById("app-status").classList.add("failed");
            document.getElementById("app-status-text").textContent = "Failed";

            browser.runtime.sendMessage({
                type: "GET_POPUP_INFO",
                content: "CHECK_LAUNCHED"
            });
        }
        gotHeartbeatResponse = false;
        browser.runtime.sendMessage({
            type: "GET_POPUP_INFO",
            content: "CHECK_APP_HEARTBEAT"
        });
    }
}

isRegularCheckForListeningDataStats = false;
async function RegularlyCheckForListeningDataStats() {
    if (isRegularCheckForListeningDataStats == true) { return; }
    while (true) {
        isRegularCheckForListeningDataStats = true;
        await sleep(5000);
        browser.runtime.sendMessage({
            type: "SEND_TO_APP",
            content: "GET_LISTENINGDATA"
        });
    }
}

function startScrollRichPresenceText(element, container) {
    let fps = 60;
    let speed = (50 / fps);
    let position = 0;
    let directionRight = true;
    let _directionRight = true;
    let idleIteration = 0;
    let idleIterationCap = (fps * 2);

    function scrollRichPresenceText() {
        if (isRPCShown == false) { isScrollRunning = false; return; }

        const containerWidth = container.offsetWidth;
        const textWidth = element.offsetWidth;

        if (directionRight != _directionRight) {
            idleIteration += 1;
            _directionRight = directionRight;
        }

        if (textWidth > containerWidth) {
            if (idleIteration != 0) {
                idleIteration += 1;
                if (idleIteration >= idleIterationCap) {
                    idleIteration = 0;
                }
            }
            else if ((position + textWidth) >= containerWidth && directionRight == true) {
                position -= speed;
            }
            else if (position < 0) {
                directionRight = false;
                position += speed;
            } else {
                position = 0;
                directionRight = true;
                idleIteration += 1;
            }
        } else {
            position = 0;
        }

        element.style.transform = `translateX(${position}px)`;

        setTimeout(() => {
            requestAnimationFrame(scrollRichPresenceText);
        }, 1000 / fps);
    }
    scrollRichPresenceText();
}

function SwitchAboutVisibility(currentOption) {
    let _aboutContainer = document.getElementById("about-container");
    if (currentOption == true) {
        _aboutContainer.style.display = "none";
    } else {
        _aboutContainer.style.display = "flex";
    }
}

function EnableTextScrolling() {
    if (isScrollRunning == false) {
        isScrollRunning = true;
        startScrollRichPresenceText(document.querySelector(".rich-presence-text-first"), document.querySelector(".rich-presence-text-container"));
        startScrollRichPresenceText(document.querySelector(".rich-presence-text-second"), document.querySelector(".rich-presence-text-container"));
        startScrollRichPresenceText(document.querySelector(".rich-presence-text-third"), document.querySelector(".rich-presence-text-container"));
        startScrollRichPresenceText(document.querySelector(".rich-presence-status-text"), document.querySelector(".rich-presence-status-text-container"));
    }
}

function TestingAsPage() {
    console.log("[Popup] Testing as page");

    document.addEventListener("DOMContentLoaded", () => {
        let configContainer = document.getElementById("config-container-data");

        let config = {
            "Test1": false,
            "Test2": false,
            "Test3": true
        };

        let configInfo = {
            "Test1": {
                "DisplayName": "Test 1",
                "Description": "This is a test description for Test 1",
                "Visibility": "Visible",
                "InternalName": "Test1"
            },
            "Test2": {
                "DisplayName": "Test 2",
                "Description": "This is a test description for Test 2",
                "Visibility": "Visible",
                "InternalName": "Test2"
            },
            "Test3": {
                "DisplayName": "Test 3",
                "Description": "This is a test description for Test 3",
                "Visibility": "Hidden",
                "InternalName": "Test3"
            }
        }

        // Config
        for (let key in config) {
            console.log(key + " : " + config[key]);
            let configItem = document.createElement("div");
            configItem.classList.add("config-container-data-object");
            configItem.setAttribute("configId", key);
            configItem.parentElement = configContainer;

            let configItemName = document.createElement("h3");
            configItemName.parentElement = configItem;
            configItemName.textContent = key;

            let configItemValue = document.createElement("div");
            configItemValue.parentElement = configItem;
            configItemValue.classList.add("button");
            configItemValue.classList.add("transition-fast");
            if (config[key] == true) { configItemValue.classList.add("enabled"); }
            else { configItemValue.classList.add("disabled"); }

            let configItemSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            configItemSvg.parentElement = configItemValue;
            configItemSvg.style.width = "100%";
            configItemSvg.style.height = "100%";

            let configItemSvgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            configItemSvgCircle.parentElement = configItemSvg;
            configItemSvgCircle.setAttribute("cx", "10");
            configItemSvgCircle.setAttribute("cy", "10");
            configItemSvgCircle.setAttribute("r", "9");
            configItemSvgCircle.setAttribute("fill", "#CCCA");
            configItemSvgCircle.classList.add("button-circle");
            configItemSvgCircle.classList.add("transition-fast");

            configItemValue.addEventListener("click", () => {
                if (configItemValue.classList.contains("enabled")) {
                    configItemValue.classList.remove("enabled");
                    configItemValue.classList.add("disabled");
                    browser.runtime.sendMessage({
                        type: "SEND_TO_APP",
                        content: "SET_CONFIG\n" + key + "\n" + false,
                    });
                } else {
                    configItemValue.classList.remove("disabled");
                    configItemValue.classList.add("enabled");
                    browser.runtime.sendMessage({
                        type: "SEND_TO_APP",
                        content: "SET_CONFIG\n" + key + "\n" + true,
                    });
                }
            });

            configItem.appendChild(configItemName);
            configItem.appendChild(configItemValue);
            configItemValue.appendChild(configItemSvg);
            configItemSvg.appendChild(configItemSvgCircle);

            configContainer.appendChild(configItem);
        }

        //ConfigInfo
        for (let key in configInfo) {
            let configItem = document.querySelector(`[configId="${key}"]`);
            let configItemName = configItem.querySelector("h3");
            configItemName.textContent = configInfo[key]["DisplayName"];

            if (configInfo[key]["Visibility"] == "Hidden") {
                configItem.style.display = "none";
            }

            if (configInfo[key]["Description"] != "") {
                let configItemTextContainer = document.createElement("div");
                configItemTextContainer.parentElement = configItem;
                configItemTextContainer.classList.add("config-container-data-object-text");
                configItem.appendChild(configItemTextContainer);

                let configItemTitle = configItem.querySelector("h3");
                configItemTextContainer.appendChild(configItemTitle);

                let configItemDescription = document.createElement("p");
                configItemDescription.parentElement = configItem;
                configItemDescription.textContent = configInfo[key]["Description"];
                configItemTextContainer.appendChild(configItemDescription);

                //Reorder elements
                configItem.appendChild(configItem.querySelector("div.button"));
            }
        }
    });
}

// Functions to be used with listening data
function display_day(value) {
    let timestamp = value * 86400 * 1000;
    let date = new Date(timestamp);
    return date.toLocaleDateString();
}

function display_time(value) {
    if (value === 0 || value == null) {
        return '0 seconds';
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return '0 seconds';
    }

    const units = [
        { value2: Math.floor(numericValue / 86400), label: 'day' },
        { value2: Math.floor((numericValue % 86400) / 3600), label: 'hour' },
        { value2: Math.floor((numericValue % 3600) / 60), label: 'minute' },
        { value2: numericValue % 60, label: 'second' }
    ];

    const parts = units.map(unit => {
        if (unit.value2 === 0 || !Number.isFinite(unit.value2)) {
            return null;
        }

        return `${unit.value2} ${unit.label}${Math.floor(unit.value2) !== 1 ? 's' : ''}`;
    }).filter(part => part !== null);

    if (parts.length === 0) {
        return '0 seconds';
    }

    if (parts.length === 1) {
        return parts[0];
    }

    const last = parts.pop();
    return `${parts.join(', ')} and ${last}`;
}

function display_datetime(value) {
    let timestamp = value * 1000;
    let date = new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}



// On start popup
document.addEventListener("DOMContentLoaded", () => {
    try {
        browser.runtime.sendMessage({
            type: "GET_POPUP_INFO",
            content: "CHECK_APP_HEARTBEAT"
        });
        document.getElementById("app-status-text").textContent = "Connecting";
        browser.runtime.sendMessage({
            type: "SEND_TO_APP",
            content: "GET_APP_VERSION"
        });
    } catch { }

    var configContainer = document.getElementById("config-container");
    var configContainerToggle = document.getElementById("config-container-toggle");
    var aboutContainer = document.getElementById("about-container");
    var aboutContainerToggle = document.getElementById("about-container-toggle");
    var statsContainer = document.getElementById("stats-container");
    var statsContainerToggle = document.getElementById("stats-container-toggle");

    configContainerToggle.addEventListener("click", () => { OpenContainer("config-container") });
    aboutContainerToggle.addEventListener("click", () => { OpenContainer("about-container") });
    statsContainerToggle.addEventListener("click", () => { OpenContainer("stats-container") });

    var toggleAbout = document.getElementById("toggle-about");

    toggleAbout.addEventListener("click", () => { SwitchToggle("toggle-about") });

    var updateCheckButton = document.getElementById("update-check-button");
    var updateInstallButton = document.getElementById("update-install-button");
    if (updateCheckButton) { updateCheckButton.addEventListener("click", RequestUpdateCheck); }
    if (updateInstallButton) { updateInstallButton.addEventListener("click", RequestUpdateInstall); }

    aboutContainer.querySelector("#about-container-data p.plus-main-text").textContent = `Version ${versionNumber}`;

    // A version reply may have arrived before the DOM was ready; paint the panel and refresh once.
    if (appSupportsUpdates) {
        RenderUpdatePanel();
        RequestUpdateStatus(true);
    }
}, { once: true });

try {
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === "SEND_POPUP_INFO") {
            console.log("[Popup] Received: " + message.content);
            if (message.content === "STATUS: ALIVE") {
                document.getElementById("app-status").classList.add("success");
                document.getElementById("app-status-text").textContent = "Connected";
                // The extension relaunches a crashed app, so clear warnings that no longer apply.
                HideWarning("warning-crashed");
                HideWarning("warning-not-launched");
                HideWarning("warning-app-locked");
                if (hasLaunched == false) {
                    GetRichPresence();
                    GetFullConfig();
                    GetListeningDataStats();
                }
                hasLaunched = true;
                gotHeartbeatResponse = true;
                if (!updateStatus) { RequestUpdateStatus(false); }
            }
            else if (message.content === "STATUS: FAILED") {
                browser.runtime.sendMessage({
                    type: "GET_POPUP_INFO",
                    content: "CHECK_LAUNCHED"
                });
                document.getElementById("app-status").classList.add("failed");
                document.getElementById("app-status-text").textContent = "Failed";
            }
            else if (message.content === "STATUS: NOT_LAUNCHED") {
                let warningContainer = document.getElementById("warning-container");
                let warningNotLaunchedContainer = document.getElementById("warning-not-launched");

                warningNotLaunchedContainer.style.display = "block";
                warningContainer.style.height = document.getElementById("warning-container-data").offsetHeight + "px";
            }
            else if (message.content === "STATUS: CRASHED") {
                let warningContainer = document.getElementById("warning-container");
                let warningCrashedContainer = document.getElementById("warning-crashed");

                warningCrashedContainer.style.display = "block";
                warningContainer.style.height = document.getElementById("warning-container-data").offsetHeight + "px";
            }
            else if (message.content === "STATUS: LOCKED") {
                ShowWarning("warning-app-locked");
            }
            else if (message.content === "STATUS: APP_OUTDATED") {
                ShowWarning("warning-app-outdated");
            }
            else if (message.content.startsWith("UPDATESTATUS: ")) {
                HandleUpdateStatus(message.content);
            }
            else if (message.content.startsWith("UPDATE: ")) {
                HandleUpdateCommandReply(message.content);
            }
            else if (message.content.includes("RPC: ")) {
                // Message content should involve: [0] = Song Name, [1] = Artist Name, [2] = Album Name, [3] = Image Link, [4] = Discord RPC Status, [5] = Timestamp Start, [6] = Timestamp End, [7] = Is program receiving RPC?, [8] = Service Name
                message.content = message.content.replace("RPC: ", "");
                currentrpcinfo = message.content.split("  .  ");

                if (firstUpdate == true) {
                    document.getElementById("rich-presence-container").classList.remove("transition");
                    firstUpdate = false;
                } else {
                    document.getElementById("rich-presence-container").classList.add("transition");
                }

                if (message.content.includes("EMPTY")) {
                    currentrpcinfo[4] = currentrpcinfo[1];
                    currentrpcinfo[7] = currentrpcinfo[2];
                }

                let isSite = true;
                if (currentrpcinfo[3]) {
                    if (!currentrpcinfo[3].includes("http") || !currentrpcinfo[3].includes("https")) {
                        currentrpcinfo[3] = "./assets/" + currentrpcinfo[3] + ".webp";
                        isSite = false;
                    }
                } else {
                    isSite = false;
                }
                if (currentrpcinfo[7] == "False") {
                    isSite = false;
                }

                document.getElementsByClassName("rich-presence-text-first")[0].textContent = currentrpcinfo[0];
                document.getElementsByClassName("rich-presence-text-second")[0].textContent = currentrpcinfo[1];
                document.getElementsByClassName("rich-presence-text-third")[0].textContent = currentrpcinfo[2];
                document.getElementsByClassName("rich-presence-image")[0].setAttribute("src", currentrpcinfo[3]);
                document.getElementsByClassName("rich-presence-image")[0].setAttribute("title", currentrpcinfo[2]);

                if (currentrpcinfo[3]) {
                    document.getElementById("rich-presence-container-background").style.background = "#666 url(" + currentrpcinfo[3] + ") 50% 50% / cover no-repeat";
                } else {
                    document.getElementById("rich-presence-container-background").style.background = "#666 50% 50% / cover no-repeat";
                }
                if (isSite == true) {
                    if (currentrpcinfo[3]) {
                        document.getElementById("main-container-background").style.background = "url(" + currentrpcinfo[3] + ") 50% 50% / 100000% no-repeat";
                    } else {
                        document.getElementById("main-container-background").style.background = "#666 50% 50% / 100000% no-repeat";
                    }
                    document.getElementById("main-container-background").style.filter = "saturate(350%)";
                    document.getElementById("main-container-background").style.opacity = "0.25";
                    document.getElementById("main-container-background").style.transition = "background-image 0.5s";
                } else {
                    document.getElementById("main-container-background").style.background = "radial-gradient(circle at 67% 100%, #2e004ddc 0%, #0000 66%), radial-gradient(circle at 0% 100%, #19005fd3 0%, #0000 66%) 50% 50% / cover no-repeat";
                    document.getElementById("main-container-background").style.filter = "saturate(100%)";
                    document.getElementById("main-container-background").style.opacity = "1";
                    document.getElementById("main-container-background").style.transition = "0";
                }

                if (currentrpcinfo[4].includes("True")) {
                    isRPCRunning = true;
                    isRPCShown = true;
                    document.getElementsByClassName("rich-presence-status-text")[0].textContent = "Rich presence is active | Currently listening on " + currentrpcinfo[8] + ".";
                    document.getElementById("rich-presence-container").classList.add("active");
                    document.getElementById("rich-presence-container").classList.remove("inactive");
                    document.getElementById("rich-presence-discord-status-image").classList.add("success");
                    document.getElementById("rich-presence-discord-status-image").classList.remove("failed");
                    document.getElementById("rich-presence-container-background").classList.add("active");
                    document.getElementById("rich-presence-container-background").classList.remove("inactive");

                    EnableTextScrolling();
                }
                else {
                    isRPCRunning = false;
                    document.getElementsByClassName("rich-presence-status-text")[0].textContent = "Rich presence is inactive";
                    document.getElementById("rich-presence-container-background").classList.remove("active");
                    document.getElementById("rich-presence-container-background").classList.add("inactive");
                    document.getElementById("rich-presence-container-background").style.background = "#666 50% 50% / cover no-repeat";
                    if (currentrpcinfo[7].includes("True")) {
                        isRPCShown = true;
                        document.getElementsByClassName("rich-presence-status-text")[0].textContent = "Rich presence is inactive | App is receiving data | Currently listening on " + currentrpcinfo[8] + ".";
                        document.getElementById("rich-presence-container").classList.add("active");
                        document.getElementById("rich-presence-container").classList.remove("inactive");
                        document.getElementById("rich-presence-discord-status-image").classList.add("failed");
                        document.getElementById("rich-presence-discord-status-image").classList.remove("success");
                        document.getElementById("rich-presence-container-background").classList.add("inactive");
                        document.getElementById("rich-presence-container-background").classList.remove("active");
                        EnableTextScrolling();
                    } else {
                        document.getElementById("rich-presence-container").classList.add("inactive");
                        document.getElementById("rich-presence-container").classList.remove("active");
                        document.getElementById("rich-presence-discord-status-image").classList.add("failed");
                        document.getElementById("rich-presence-discord-status-image").classList.remove("success");
                    }
                }

                if (currentrpcinfo[6] < 1) { currentrpcinfo[6] = Math.floor(Date.now() / 1000); }

                let currentTime = Math.floor(Date.now() / 1000);
                let songDuration = parseInt(currentrpcinfo[6]) - parseInt(currentrpcinfo[5]);

                if ((currentTime - currentrpcinfo[5]) > songDuration) {
                    document.getElementsByClassName("rich-presence-time-start")[0].textContent = ConvertIntoTimestamp(songDuration);
                } else {
                    document.getElementsByClassName("rich-presence-time-start")[0].textContent = ConvertIntoTimestamp(currentTime - currentrpcinfo[5]);
                }
                document.getElementsByClassName("rich-presence-time-end")[0].textContent = ConvertIntoTimestamp(songDuration);

                let percentage = (((currentTime - currentrpcinfo[5]) - 0) / (songDuration - 0) * 100);

                document.querySelector(".rich-presence-time-graphics-elapsed").style.width = percentage + "%";
            }
            else if (message.content.includes("CONFIG: ")) {
                message.content = message.content.replace("CONFIG: ", "");
                let config = JSON.parse(message.content);
                let configContainer = document.getElementById("config-container-data");

                for (let key in config) {
                    console.log(key + " : " + config[key]);
                    let configItem = document.createElement("div");
                    configItem.classList.add("config-container-data-object");
                    configItem.setAttribute("configId", key);
                    configItem.parentElement = configContainer;

                    let configItemName = document.createElement("h3");
                    configItemName.parentElement = configItem;
                    configItemName.textContent = key;

                    let configItemValue = document.createElement("div");
                    configItemValue.parentElement = configItem;
                    configItemValue.classList.add("button");
                    configItemValue.classList.add("transition-fast");
                    if (config[key] == true) { configItemValue.classList.add("enabled"); }
                    else { configItemValue.classList.add("disabled"); }

                    let configItemSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    configItemSvg.parentElement = configItemValue;
                    configItemSvg.style.width = "100%";
                    configItemSvg.style.height = "100%";

                    let configItemSvgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    configItemSvgCircle.parentElement = configItemSvg;
                    configItemSvgCircle.setAttribute("cx", "10");
                    configItemSvgCircle.setAttribute("cy", "10");
                    configItemSvgCircle.setAttribute("r", "9");
                    configItemSvgCircle.setAttribute("fill", "#CCCA");
                    configItemSvgCircle.classList.add("button-circle");
                    configItemSvgCircle.classList.add("transition-fast");

                    configItemValue.addEventListener("click", () => {
                        if (configItemValue.classList.contains("enabled")) {
                            configItemValue.classList.remove("enabled");
                            configItemValue.classList.add("disabled");
                            browser.runtime.sendMessage({
                                type: "SEND_TO_APP",
                                content: "SET_CONFIG\n" + key + "\n" + false
                            });
                        } else {
                            configItemValue.classList.remove("disabled");
                            configItemValue.classList.add("enabled");
                            browser.runtime.sendMessage({
                                type: "SEND_TO_APP",
                                content: "SET_CONFIG\n" + key + "\n" + true
                            });
                        }
                    });

                    configItem.appendChild(configItemName);
                    configItem.appendChild(configItemValue);
                    configItemValue.appendChild(configItemSvg);
                    configItemSvg.appendChild(configItemSvgCircle);

                    configContainer.appendChild(configItem);
                    browser.runtime.sendMessage({
                        type: "SEND_TO_APP",
                        content: "GET_CONFIG_INFO\n" + key
                    });
                }
            }
            else if (message.content.includes("CONFIGINFO: ")) {
                message.content = message.content.replace("CONFIGINFO: ", "");

                let configInfo = JSON.parse(message.content);
                let configId = configInfo["InternalName"];

                let configItem = document.querySelector(`[configId="${configId}"]`);

                let configItemName = configItem.querySelector("h3");
                configItemName.textContent = configInfo["DisplayName"];

                if (configInfo["Type"] == "category") {
                    configItem.querySelector("h3").style.fontSize = "16px";
                    configItem.querySelector("div").remove();
                }

                if (configInfo["Visibility"] == "Hidden") {
                    configItem.style.display = "none";
                }

                if (configInfo["Description"] != "") {
                    let configItemTextContainer = document.createElement("div");
                    configItemTextContainer.parentElement = configItem;
                    configItemTextContainer.classList.add("config-container-data-object-text");
                    configItem.appendChild(configItemTextContainer);

                    let configItemTitle = configItem.querySelector("h3");
                    configItemTextContainer.appendChild(configItemTitle);

                    let configItemDescription = document.createElement("p");
                    configItemDescription.parentElement = configItem;
                    configItemDescription.textContent = configInfo["Description"];
                    configItemTextContainer.appendChild(configItemDescription);

                    //Reorder elements
                    configItem.appendChild(configItem.querySelector("div.button"));
                }
            }
            else if (message.content.includes("APPVERSION: ")) {
                // "APPVERSION: 1.11.0" or "APPVERSION: 1.11.0;PROTO=2".
                const rawVersion = message.content.replace("APPVERSION: ", "").trim();
                const protocolMatch = rawVersion.match(/PROTO=(\d+)/i);
                const appProtocol = protocolMatch ? parseInt(protocolMatch[1], 10) : 1;
                const appVersion = rawVersion.split(";")[0].trim();

                var aboutContainer = document.getElementById("about-container");
                let versionText = aboutContainer.querySelector("#about-container-data p.plus-main-text");
                versionText.textContent = `Version: ${versionNumber} | App Version: ${appVersion}`;

                const outdated = IsOlderVersion(appVersion, MIN_APP_VERSION) || appProtocol < MIN_PROTO;
                const warning = document.getElementById("about-container-app-warning");
                warning.textContent = outdated
                    ? "Your desktop app is out of date. Update VRPC to get the latest fixes and features."
                    : "";
                warning.style.display = outdated ? "block" : "none";
                if (outdated) { ShowWarning("warning-app-outdated"); }
                else { HideWarning("warning-app-outdated"); }

                // The update commands exist only in 1.1.0 and newer. An older app's status parser
                // treats an unknown first line as a service name, so never send one there; the
                // parsed version must be well formed as well, not just compare as new enough.
                const supportsUpdates = ParseVersion(appVersion) !== null && !IsOlderVersion(appVersion, MIN_UPDATE_APP_VERSION);
                if (supportsUpdates && !appSupportsUpdates) {
                    appSupportsUpdates = true;
                    StartUpdatePolling(true);
                } else if (!supportsUpdates && appSupportsUpdates) {
                    appSupportsUpdates = false;
                    StopUpdatePolling();
                }
            }
            else if (message.content.includes("LDSTATS: ")) {
                message.content = message.content.replace("LDSTATS: ", "");

                statsDataDiv = document.getElementById("stats-container-data-object");

                let elements = statsDataDiv.querySelectorAll("h3");

                if (elements != null) {
                    for (let i = 0; i < elements.length; i++) {
                        elements[i].remove();
                    }
                }

                let hasData = false;
                try {
                    ldstats = JSON.parse(message.content);
                    if (ldstats && Object.keys(ldstats).length > 0) {
                        hasData = true;
                        for ([key, value] of Object.entries(ldstats)) {
                            let key_text;
                            let value_text;
                            switch (key) {
                                case "name":
                                    key_text = "Name";
                                    value_text = value;
                                    break;
                                case "author":
                                    key_text = "Author";
                                    value_text = value;
                                    break;
                                case "key":
                                    key_text = "Key";
                                    value_text = value;
                                    break;
                                case "timelistened":
                                    key_text = "Time Listened";
                                    value_text = display_time(value);
                                    break;
                                case "firstlistened":
                                    key_text = "First Listened";
                                    value_text = display_datetime(value);
                                    break;
                                case "lastplayed":
                                    key_text = "Last Played";
                                    value_text = display_datetime(value);
                                    break;
                                case "daylastplayedtimelistened":
                                    key_text = "Time Listened Today";
                                    value_text = display_time(value);
                                    break;
                                case "daymostplayed":
                                    key_text = "Day Most Played";
                                    value_text = display_day(value);
                                    break;
                                case "daymostplayedtimelistened":
                                    key_text = "Time Listened on Day Most Played";
                                    value_text = display_time(value);
                                    break;
                                case "isvideo":
                                    key_text = "Video";
                                    value_text = value;
                                    break;
                                case "songurl":
                                    key_text = "Song URL";
                                    value_text = value;
                                    break;
                                case "lastplatformlistenedon":
                                    key_text = "Platform";
                                    value_text = value;
                                    break;
                                case "songduration":
                                    key_text = "Song Duration";
                                    value_text = display_time(value);
                                    break;
                            }
                            let h3Element = document.createElement("h3");
                            h3Element.textContent = key_text + ": ";
                            h3Element.style.color = "#999";
                            h3Element.style.marginTop = "4px";
                            h3Element.style.marginBottom = "4px";
                            statsDataDiv.appendChild(h3Element);
                            let spanElement = document.createElement("span");
                            spanElement.textContent = value_text;
                            spanElement.style.color = "#dedede";
                            h3Element.appendChild(spanElement);
                        }
                    }
                } catch (e) {
                    hasData = false;
                }
                document.getElementById("stats-container").style.display = hasData ? "flex" : "none";

                if (hasData && !document.getElementById("stats-container").classList.contains("closed")) {
                    let height = document.getElementById("stats-container-data").offsetHeight;
                    document.getElementById("stats-container").style.height = height + "px";
                }
            }
        }
    });
} catch { TestingAsPage(); }

RegularlyCheckForRichPresence();
RegularlyCheckForHeartbeat();
RegularlyCheckForListeningDataStats();
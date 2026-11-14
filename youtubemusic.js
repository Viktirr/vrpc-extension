// Chrome support
if (typeof browser === 'undefined') {
  var browser = chrome;
}
console.log('YouTube Music script is running.');
browser.runtime.sendMessage({
  type: "SET_STATUS_INFO",
  content: "YouTube Music\nOpened"
});
// The player bar became a mini player built from ytmusic-track-info; the old bar is kept as a
// fallback because both layouts are still served.
const SELECTORS = {
  MINI_PLAYER: "ytmusic-miniplayer",
  TRACK_INFO: "ytmusic-track-info",
  TRACK_TITLE: ".ytmusicTrackInfoTitle",
  TRACK_BYLINE: ".ytmusicTrackInfoBylineItem",
  TRACK_LINK: ".ytmusicTrackInfoBylineItem a",
  TRACK_THUMBNAIL: "img.ytmusicTrackInfoThumbnail",
  PROGRESS_SLIDER: "input.ytMusicMiniPlayerProgressBar",
  PLAYER_BAR: "ytmusic-player-bar",
  SONG_TITLE: 'div.middle-controls div.content-info-wrapper yt-formatted-string',
  THUMBNAIL_IMG: 'div.middle-controls div.thumbnail-image-wrapper img.image',
  SONG_INFO: 'div.middle-controls div.content-info-wrapper span.ytmusic-player-bar span.subtitle yt-formatted-string',
  ARTIST_LINK: 'div.middle-controls div.content-info-wrapper span.ytmusic-player-bar span.subtitle yt-formatted-string a.yt-formatted-string'
};
const TICK_INTERVAL = 1000;
const MAX_ATTACH_ATTEMPTS = 60;

let previousState = {
  title: "",
  artist: "",
  album: "",
  year: "",
  duration: 0,
  currentTime: 0,
  status: ""
};

function TimeToSeconds(value) {
  if (!value) { return 0; }
  const parts = String(value).trim().split(":").map(part => Number(part.trim()));
  if (parts.some(part => !Number.isFinite(part))) { return 0; }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function SplitByline(value) {
  const parts = String(value || "").split("•").map(part => part.trim()).filter(part => part.length > 0);
  const [artist, album, year] = parts;
  return { artist: artist || "", album: album || "", year: year || "" };
}

function ReadTrackInfo() {
  const track = document.querySelector(SELECTORS.MINI_PLAYER)?.querySelector(SELECTORS.TRACK_INFO);
  if (!track) { return null; }
  const titleElement = track.querySelector(SELECTORS.TRACK_TITLE);
  const bylineElement = track.querySelector(SELECTORS.TRACK_BYLINE);
  const thumbnailElement = track.querySelector(SELECTORS.TRACK_THUMBNAIL);
  const byline = bylineElement?.getAttribute("title") || bylineElement?.innerText || "";
  const info = SplitByline(byline);
  if (!info.artist) {
    info.artist = (bylineElement?.querySelector(SELECTORS.TRACK_LINK)?.innerText || "").trim();
  }
  return {
    title: (titleElement?.getAttribute("title") || titleElement?.innerText || "").trim(),
    artist: info.artist,
    album: info.album,
    year: info.year,
    thumbnail: (thumbnailElement?.src || "").replace(/=w\d+-h\d+/, "=w544-h544")
  };
}

function ReadLegacyTrackInfo() {
  const songInfo = document.querySelector(SELECTORS.SONG_INFO)?.getAttribute("title") || "";
  const info = SplitByline(songInfo);
  if (!info.artist) {
    info.artist = (document.querySelector(SELECTORS.ARTIST_LINK)?.innerText || "").trim();
  }
  return {
    title: (document.querySelector(SELECTORS.SONG_TITLE)?.innerText || "").trim(),
    artist: info.artist,
    album: info.album,
    year: info.year,
    thumbnail: document.querySelector(SELECTORS.THUMBNAIL_IMG)?.src || ""
  };
}

function ReadPlayback() {
  const video = document.querySelector("video");
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    return {
      duration: Math.floor(video.duration),
      currentTime: Math.floor(video.currentTime) || 0,
      status: video.paused ? "Paused" : "Playing"
    };
  }
  const slider = document.querySelector(SELECTORS.PROGRESS_SLIDER);
  if (slider) {
    const [position, total] = (slider.getAttribute("aria-valuetext") || "").split(/\s+of\s+/i);
    return {
      duration: Math.floor(Number(slider.max) || TimeToSeconds(total)),
      currentTime: TimeToSeconds(position),
      status: video && !video.paused ? "Playing" : "Paused"
    };
  }
  return {
    duration: previousState.duration || 0,
    currentTime: previousState.currentTime || 0,
    status: "Paused"
  };
}

function getCurrentState() {
  const state = {
    title: "",
    artist: "",
    album: "",
    year: "",
    duration: 0,
    currentTime: 0,
    status: "Paused",
    id: "",
    thumbnail: "",
    hasChanged: false
  };
  try {
    const track = ReadTrackInfo() || ReadLegacyTrackInfo();
    state.title = track.title;
    state.artist = track.artist;
    state.album = track.album;
    state.year = track.year;
    state.thumbnail = track.thumbnail;
    Object.assign(state, ReadPlayback());
    try {
      state.id = new URL(window.location.href).searchParams.get("v") || "";
    } catch (error) {
      console.log("Couldn't retrieve video ID");
    }
    state.hasChanged = state.title !== previousState.title ||
      state.artist !== previousState.artist ||
      state.album !== previousState.album ||
      state.year !== previousState.year ||
      state.duration !== previousState.duration ||
      state.status !== previousState.status ||
      state.currentTime !== previousState.currentTime;
  } catch (error) {
    console.error("Error retrieving player state:", error);
  }
  return state;
}

function handleStateUpdate(state) {
  // A torn down player reports nothing at all; posting that would blank out whatever is on screen.
  if (!state.hasChanged || !state.title) return;

  browser.runtime.sendMessage({
    type: "SET_RPC_INFO",
    content: `YouTube Music\n${state.title}\n${state.artist}\n${state.duration}\n${state.status}\n${state.id}\n${state.thumbnail}\n${state.album}\n${state.year}\n${state.currentTime}`
  });

  previousState = {
    title: state.title,
    artist: state.artist,
    album: state.album,
    year: state.year,
    duration: state.duration,
    currentTime: state.currentTime,
    status: state.status
  };
}

// Which player the account is bucketed into is decided server side, so pick the layout at runtime
// instead of assuming one of them.
function DetectLayout() {
  const mini = document.querySelector(SELECTORS.MINI_PLAYER);
  if (mini) { return { kind: "mini", host: mini }; }
  const legacy = document.querySelector(SELECTORS.PLAYER_BAR);
  if (legacy) { return { kind: "legacy", host: legacy }; }
  return { kind: "none", host: null };
}

function AttachObserver() {
  const layout = DetectLayout();
  if (!layout.host) { return false; }
  if (layout.kind !== layoutKind) {
    layoutKind = layout.kind;
    console.log(`YouTube Music layout: ${layout.kind}`);
  }
  observedHost = layout.host;
  observer?.disconnect();
  observer = new MutationObserver(() => {
    handleStateUpdate(getCurrentState());
  });
  observer.observe(layout.host, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["title", "src", "aria-valuetext"]
  });
  return true;
}

// The clock lives on the video element, which sits outside the mini player, so mutations alone
// can't keep the timestamp moving. The same tick notices a player that got swapped out.
function StartTicking() {
  if (tickTimer) { return; }
  tickTimer = setInterval(() => {
    const layout = DetectLayout();
    if (layout.host && layout.host !== observedHost) {
      attachAttempts = 0;
      initialize();
      return;
    }
    handleStateUpdate(getCurrentState());
  }, TICK_INTERVAL);
}

let observer = null;
let tickTimer = null;
let attachAttempts = 0;
let observedHost = null;
let layoutKind = "";

function initialize() {
  clearTimeout(attachTimer);
  if (AttachObserver()) {
    attachAttempts = 0;
    StartTicking();
    handleStateUpdate(getCurrentState());
    return;
  }
  if (attachAttempts >= MAX_ATTACH_ATTEMPTS) {
    console.error("Player bar not found");
    return;
  }
  attachAttempts += 1;
  attachTimer = setTimeout(initialize, TICK_INTERVAL);
}

let attachTimer = null;

if (document.readyState === "complete") {
  initialize();
} else {
  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") initialize();
  });
}

window.addEventListener("yt-navigate-finish", () => {
  attachAttempts = 0;
  initialize();
});

window.addEventListener("pagehide", () => {
  browser.runtime.sendMessage({
    type: "SET_STATUS_INFO",
    content: "YouTube Music\nClosed"
  });
});

// The page can come back from the bfcache without the content script running again.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) { return; }
  browser.runtime.sendMessage({
    type: "SET_STATUS_INFO",
    content: "YouTube Music\nOpened"
  });
  attachAttempts = 0;
  initialize();
});

// Chrome support
if (typeof browser === 'undefined') {
  var browser = chrome;
}

console.log('YouTube Music script is running.');
browser.runtime.sendMessage({
  type: "SET_STATUS_INFO",
  content: "YouTube Music\nOpened"
});

const SELECTORS = {
  PLAYER_BAR: "ytmusic-player-bar",
  SONG_TITLE: 'div.middle-controls div.content-info-wrapper yt-formatted-string',
  SONG_DURATION: 'div#left-controls span.time-info',
  PLAY_PAUSE_BUTTON: 'div#left-controls tp-yt-paper-icon-button#play-pause-button',
  THUMBNAIL_IMG: 'div.middle-controls div.thumbnail-image-wrapper img.image',
  SONG_INFO: 'div.middle-controls div.content-info-wrapper span.ytmusic-player-bar span.subtitle yt-formatted-string',
  ARTIST_LINK: 'div.middle-controls div.content-info-wrapper span.ytmusic-player-bar span.subtitle yt-formatted-string a.yt-formatted-string'
};

let previousState = {
  title: "",
  duration: "",
  status: "",
  info: ""
};

function getCurrentState() {
  const state = {
    title: "",
    artist: "",
    album: "",
    year: "",
    duration: "",
    status: "Paused",
    id: "",
    thumbnail: "",
    hasChanged: false
  };

  try {
    // Basic elements
    state.title = document.querySelector(SELECTORS.SONG_TITLE)?.innerText || "";
    const durationElement = document.querySelector(SELECTORS.SONG_DURATION);
    state.duration = durationElement?.innerText.replace(/\s+/g, ' ') || "";

    // Play/Pause state
    const playButton = document.querySelector(SELECTORS.PLAY_PAUSE_BUTTON);
    const isPlaying = playButton?.getAttribute("title") === "Pause";
    state.status = isPlaying ? "Playing" : "Paused";

    // Thumbnail
    state.thumbnail = document.querySelector(SELECTORS.THUMBNAIL_IMG)?.src || "";

    // Song information parsing
    const songInfoElement = document.querySelector(SELECTORS.SONG_INFO);
    const songInfo = songInfoElement?.getAttribute("title") || "";
    
    if (songInfo) {
      const infoParts = songInfo.split("•").map(part => part.trim());
      [state.artist, state.album, state.year] = infoParts;
    } else {
      state.artist = document.querySelector(SELECTORS.ARTIST_LINK)?.innerText || "";
    }

    // Video ID/URL
    try {
      state.id = new URL(window.location.href).searchParams.get("v") || "";
    } catch (error) {
      console.log("Couldn't retrieve video ID");
    }

    // Change detection
    state.hasChanged = state.title !== previousState.title ||
      state.duration !== previousState.duration ||
      state.status !== previousState.status ||
      state.artist !== previousState.artist;

  } catch (error) {
    console.error("Error retrieving player state:", error);
  }

  return state;
}

function handleStateUpdate(state) {
  if (!state.hasChanged) return;

  browser.runtime.sendMessage({
    type: "SET_RPC_INFO",
    content: `YouTube Music\n${state.title}\n${state.artist}\n${state.duration}\n${state.status}\n${state.id}\n${state.thumbnail}\n${state.album}\n${state.year}`
  });

  previousState = {
    title: state.title,
    duration: state.duration,
    status: state.status,
    artist: state.artist
  };
}

function createObserver() {
  const observer = new MutationObserver((mutations) => {
    const currentState = getCurrentState();
    handleStateUpdate(currentState);
  });

  const playerBar = document.querySelector(SELECTORS.PLAYER_BAR);
  if (!playerBar) {
    console.error("Player bar not found");
    return;
  }

  observer.observe(playerBar, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["title", "src"]
  });

  return observer;
}

// Initialization
let observer;
function initialize() {
  observer?.disconnect();
  observer = createObserver();
  const initialState = getCurrentState();
  handleStateUpdate(initialState);
}

if (document.readyState === "complete") {
  initialize();
} else {
  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") initialize();
  });
}

window.addEventListener("beforeunload", () => {
  browser.runtime.sendMessage({
    type: "SET_STATUS_INFO",
    content: "YouTube Music\nClosed"
  });
});
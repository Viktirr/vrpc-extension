// Chrome support
if (typeof browser === 'undefined') {
    var browser = chrome;
}

console.log("Soundcloud script is run.");
browser.runtime.sendMessage({
    type: "SET_STATUS_INFO",
    content: "Soundcloud\nOpened"
});
browser.runtime.sendMessage({
    type: "SET_RPC_INFO",
    content: "Soundcloud" + "\n"
});

let PlayControlsDiv;
let previousSong = { title: null, artist: null, currentTime: null, totalTime: null, status: null };

function readSongInformation() {
    const songInformationDiv = PlayControlsDiv.querySelector('div.playControls__elements div.playControls__soundBadge div.playbackSoundBadge');
    if (!songInformationDiv) { return null; }

    const titleLink = songInformationDiv.querySelector('div.playbackSoundBadge__titleContextContainer div.playbackSoundBadge__title a.playbackSoundBadge__titleLink');
    const artistLink = songInformationDiv.querySelector('div.playbackSoundBadge__titleContextContainer a.playbackSoundBadge__lightLink');
    const avatar = songInformationDiv.querySelector('a.playbackSoundBadge__avatar');
    const artwork = songInformationDiv.querySelector('a.playbackSoundBadge__avatar div.sc-artwork span.sc-artwork');
    const timeline = PlayControlsDiv.querySelector('div.playControls__elements div.playControls__timeline div.playbackTimeline div.playbackTimeline__progressWrapper');
    const playButton = PlayControlsDiv.querySelector('div.playControls__elements button.playControls__play');

    // Nothing to report until the player bar actually holds a track.
    if (!titleLink || !timeline || !playButton) { return null; }

    let bannerUrl = "";
    if (artwork) {
        const style = artwork.getAttribute("style") || "";
        const match = style.match(/url\(["']?(.*?)["']?\)/);
        if (match && match[1]) { bannerUrl = match[1]; }
    }

    let songUrl = "";
    if (avatar) {
        const href = avatar.getAttribute("href");
        if (href) { songUrl = "https://soundcloud.com" + href; }
    }

    return {
        title: titleLink.getAttribute("title") || "",
        artist: artistLink ? (artistLink.getAttribute("title") || "") : "",
        currentTime: timeline.getAttribute("aria-valuenow") || "0",
        totalTime: timeline.getAttribute("aria-valuemax") || "0",
        status: playButton.classList.contains('playing') ? "Playing" : "Paused",
        banner: bannerUrl,
        url: songUrl
    };
}

function sendSongInformation(song) {
    browser.runtime.sendMessage({
        type: "SET_RPC_INFO",
        content: "Soundcloud" + "\n" + song.title + "\n" + song.artist + "\n" + song.currentTime + "\n" + song.totalTime + "\n" + song.status + "\n" + song.banner + "\n" + song.url
    });
}

function runObserver() {
    const observer = new MutationObserver(() => {
        const song = readSongInformation();
        if (!song) { return; }

        // The player bar mutates many times per second, so only report real changes. The elapsed
        // time is part of the check because it is what keeps the progress bar moving.
        if (song.title === previousSong.title &&
            song.artist === previousSong.artist &&
            song.currentTime === previousSong.currentTime &&
            song.totalTime === previousSong.totalTime &&
            song.status === previousSong.status) { return; }

        previousSong = song;
        sendSongInformation(song);
    });

    observer.observe(PlayControlsDiv, { childList: true, subtree: true, attributes: true });
}

function checkForPlayerBar() {
    PlayControlsDiv = document.querySelector('.playControls__wrapper');
    if (PlayControlsDiv) {
        console.log("Player bar found, starting observer");
        runObserver();
    } else {
        console.log("Player bar not found yet, retrying in 5 seconds...");
        setTimeout(checkForPlayerBar, 5000);
    }
}

if (document.readyState === "complete") {
    console.log("Document is ready, checking player bar")
    checkForPlayerBar();
} else {
    console.log("Document is not ready, adding event listener..")
    document.addEventListener("readystatechange", function () {
        if (document.readyState === "complete") {
            console.log("Document is ready, checking player bar");
            checkForPlayerBar();
        }
    })
}

window.addEventListener("pagehide", () => {
    browser.runtime.sendMessage({
        type: "SET_STATUS_INFO",
        content: "Soundcloud\nClosed"
    });
});

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        browser.runtime.sendMessage({
            type: "SET_STATUS_INFO",
            content: "Soundcloud\nOpened"
        });
    }
});

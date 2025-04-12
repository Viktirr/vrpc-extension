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

songTitle = "";
artistName = "";

previousSongTitle = "";
previousArtistName = "";
previousSongDuration = "";
previousSongStatus = "";

let PlayControlsDiv;

function runObserver() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes') {
                songInformationDiv = PlayControlsDiv.querySelector('div.playControls__elements div.playControls__soundBadge div.playbackSoundBadge');

                songTitle = songInformationDiv.querySelector('div.playbackSoundBadge__titleContextContainer div.playbackSoundBadge__title a.playbackSoundBadge__titleLink').getAttribute("title");
                songArtist = songInformationDiv.querySelector('div.playbackSoundBadge__titleContextContainer a.playbackSoundBadge__lightLink').getAttribute("title");

                smallSongBanner = songInformationDiv.querySelector('a.playbackSoundBadge__avatar div.sc-artwork span.sc-artwork').getAttribute("style");
                smallSongBannerUrl = smallSongBanner.match(/url\(["']?(.*?)["']?\)/);

                songDuration = PlayControlsDiv.querySelector('div.playControls__elements div.playControls__timeline div.playbackTimeline div.playbackTimeline__progressWrapper');

                songStatus = PlayControlsDiv.querySelector('div.playControls__elements button.playControls__play');

                songId = songInformationDiv.querySelector('a.playbackSoundBadge__avatar').getAttribute("href");
                songUrl = "https://soundcloud.com/" + songId;

                if (songStatus.classList.contains('playing')) {
                    songStatus = "Playing";
                } else {
                    songStatus = "Paused";
                }

                //if (smallSongBannerUrl && smallSongBannerUrl[1]) { console.log(smallSongBannerUrl[1]); }

                // console.log(songStatus);
                // console.log("Song Title: " + songTitle);
                // console.log("Duration: " + songDuration.getAttribute("aria-valuenow") + " / " + songDuration.getAttribute("aria-valuemax"));
                // console.log(songUrl);
                // console.log(songArtist);
                // console.log(smallSongBannerUrl[1]);

                if ((songTitle.innerText != previousSongTitle) || (previousSongDuration != songDuration.innerText) || (songStatus != previousSongStatus)) {
                    browser.runtime.sendMessage({
                        type: "SET_RPC_INFO",
                        content: "Soundcloud" + "\n" + songTitle + "\n" + songArtist + "\n" + songDuration.getAttribute("aria-valuenow") + "\n" + songDuration.getAttribute("aria-valuemax") + "\n" + songStatus + "\n" + smallSongBannerUrl[1] + "\n" + songUrl
                    });
                }
            }
        });
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

window.addEventListener("beforeunload", () => {
    browser.runtime.sendMessage({
        type: "SET_STATUS_INFO",
        content: "Soundcloud\nClosed"
    });
});
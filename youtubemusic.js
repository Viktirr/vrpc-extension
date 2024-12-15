console.log('YouTube Music script is ran.');
browser.runtime.sendMessage({
  type: "GET_STATUS_INFO",
  content: "YouTube Music\nOpened"
});
browser.runtime.sendMessage({
  type: "GET_RPC_INFO",
  content: "Youtube Music" + "\n"
});

songTitle = "";
artistName = "";

previousSongTitle = "";
previousArtistName = "";
previousSongDuration = "";
previousSongStatus = "";

function runObserver()
{
  const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          songTitle = document.querySelector('div.middle-controls div.content-info-wrapper yt-formatted-string');
          artistName = document.querySelector('div.middle-controls div.content-info-wrapper span.ytmusic-player-bar span.subtitle yt-formatted-string a.yt-formatted-string');
          songDuration = document.querySelector('div#left-controls span.time-info');
          songStatus = document.querySelector('div#left-controls tp-yt-paper-icon-button#play-pause-button').getAttribute("title");
          smallSongBannerUrl = document.querySelector('div.middle-controls div.thumbnail-image-wrapper img.image').getAttribute("src");

          songUrl = new URL(window.location.href);
          try {
            songId = songUrl.searchParams.get("v");
          } catch (error) {
            songId = "";
            console.log("Couldn't retrieve url.");
          }
          

          if (songStatus === "Play")
          {
            songStatus = "Paused";
          } else {
            songStatus = "Playing";
          }

          songDurationCleaned = songDuration.innerText.replace(/\n {4}/g, '').replace(/\n {2}/g, '');

          if (songTitle) {
            if (songTitle.innerText != previousSongTitle) {
              //console.log('Song Title:', songTitle.innerText);
            }
          }

          if (artistName) {
            if(artistName.innerText != previousArtistName) {
              //console.log('Artist Name:', artistName.innerText);
            }
          }

          if (songDuration) {
            //console.log('Song Duration:', songDurationCleaned);
          }

          if ((songTitle.innerText != previousSongTitle) || (previousSongDuration != songDuration.innerText) || (songStatus != previousSongStatus)) {
            browser.runtime.sendMessage({
              type: "GET_RPC_INFO",
              content: "Youtube Music" + "\n" + songTitle.innerText + "\n" + artistName.innerText + "\n" + songDurationCleaned + "\n" + songStatus + "\n" + songId + "\n" + smallSongBannerUrl
            });
          }
          previousSongTitle = songTitle.innerText;
          previousArtistName = artistName.innerText;
          previousSongDuration = songDuration.innerText;
          previousSongStatus = songStatus;
        }
      });
    });
    
  observer.observe(document.querySelector("ytmusic-player-bar"), { childList: true, subtree: true, attributes: true });
}

if (document.readyState === "complete")
{
  console.log("Document is ready, starting observer")
  runObserver();
} else {
  console.log("Document is not ready, adding event listener..")
  document.addEventListener("readystatechange", function() {
    if(document.readyState === "complete") {
      console.log("Document is ready, starting observer");
      runObserver();
    }
})
}

window.addEventListener("unload", () => {
  browser.runtime.sendMessage({
    type: "GET_STATUS_INFO",
    content: "YouTube Music\nClosed"
  });
});
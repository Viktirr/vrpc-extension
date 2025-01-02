let isRPCRunning = false;
let isScrollRunning = false;
let firstUpdate = true;

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


function startScrollRichPresenceText(element, container) {
    let fps = 60;
    let speed = (50 / fps);
    let position = 0;
    let directionRight = true;
    let _directionRight = true;
    let idleIteration = 0;
    let idleIterationCap = (fps * 2);

    function scrollRichPresenceText() {
        if (isRPCRunning == false) { isScrollRunning = false; return; }

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

document.addEventListener("DOMContentLoaded", () => {
    try {
        browser.runtime.sendMessage({
            type: "GET_POPUP_INFO",
            content: "CHECK_APP_HEARTBEAT"
        });
        document.getElementById("app-status-text").innerHTML = "Connecting";    
    } catch { }

    var configContainer = document.getElementById("config-container-toggle");
    var aboutContainer = document.getElementById("about-container-toggle");

    configContainer.addEventListener("click", () => { OpenContainer("config-container") });
    aboutContainer.addEventListener("click", () => { OpenContainer("about-container") });

    var toggleAbout = document.getElementById("toggle-about");

    toggleAbout.addEventListener("click", () => { SwitchToggle("toggle-about") });


}, { once: true });

browser.runtime.onMessage.addListener((message) => {
    if (message.type === "SEND_POPUP_INFO") {
        console.log("[Popup] Received: " + message.content);
        if (message.content === "STATUS: ALIVE") {
            document.getElementById("app-status").classList.add("success");
            document.getElementById("app-status-text").innerHTML = "Connected";
            GetRichPresence();
        }
        else if (message.content === "STATUS: FAILED") {
            document.getElementById("app-status").classList.add("failed");
            document.getElementById("app-status-text").innerHTML = "Failed";
        }
        else if (message.content.includes("RPC: ")) {
            // Message content should involve: [0] = Song Name, [1] = Artist Name, [2] = Album Name, [3] = Image Link, [4] = Discord RPC Status, [5] = Timestamp Start, [6] = Timestamp End, [7] = Is program receiving RPC?
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

            document.getElementsByClassName("rich-presence-text-first")[0].innerHTML = currentrpcinfo[0];
            document.getElementsByClassName("rich-presence-text-second")[0].innerHTML = currentrpcinfo[1];
            document.getElementsByClassName("rich-presence-text-third")[0].innerHTML = currentrpcinfo[2];
            document.getElementsByClassName("rich-presence-image")[0].setAttribute("src", currentrpcinfo[3]);
            document.getElementsByClassName("rich-presence-image")[0].setAttribute("title", currentrpcinfo[2]);

            document.getElementById("rich-presence-container-background").style.background = "#666 url(" + currentrpcinfo[3] + ") 0 0 / cover no-repeat";

            if (currentrpcinfo[4].includes("True")) {
                isRPCRunning = true;
                document.getElementsByClassName("rich-presence-status-text")[0].innerHTML = "Rich presence is active.";
                document.getElementById("rich-presence-container").classList.add("active");
                document.getElementById("rich-presence-container").classList.remove("inactive");
                document.getElementById("rich-presence-discord-status-image").classList.add("success");
                document.getElementById("rich-presence-discord-status-image").classList.remove("failed");
                document.getElementById("rich-presence-container-background").classList.add("active");
                document.getElementById("rich-presence-container-background").classList.remove("inactive");

                if (isScrollRunning == false) {
                    isScrollRunning = true;
                    startScrollRichPresenceText(document.querySelector(".rich-presence-text-first"), document.querySelector(".rich-presence-text-container"));
                    startScrollRichPresenceText(document.querySelector(".rich-presence-text-second"), document.querySelector(".rich-presence-text-container"));
                    startScrollRichPresenceText(document.querySelector(".rich-presence-text-third"), document.querySelector(".rich-presence-text-container"));
                }
            }
            else {
                isRPCRunning = false;
                document.getElementsByClassName("rich-presence-status-text")[0].innerHTML = "Rich presence is inactive.";
                document.getElementById("rich-presence-container-background").classList.remove("active");
                document.getElementById("rich-presence-container-background").classList.add("inactive");
                if (currentrpcinfo[7].includes("True")) {
                    document.getElementsByClassName("rich-presence-status-text")[0].innerHTML = "Rich presence is inactive. App is receiving data.";
                    document.getElementById("rich-presence-container").classList.add("active");
                    document.getElementById("rich-presence-container").classList.remove("inactive");
                    document.getElementById("rich-presence-discord-status-image").classList.add("success");
                    document.getElementById("rich-presence-discord-status-image").classList.remove("failed");
                }
                document.getElementById("rich-presence-container").classList.add("inactive");
                document.getElementById("rich-presence-container").classList.remove("active");
                document.getElementById("rich-presence-discord-status-image").classList.add("failed");
                document.getElementById("rich-presence-discord-status-image").classList.remove("success");
            }

            if (currentrpcinfo[6] < 1) { currentrpcinfo[6] = Math.floor(Date.now() / 1000); }

            let currentTime = Math.floor(Date.now() / 1000);
            let songDuration = parseInt(currentrpcinfo[6]) - parseInt(currentrpcinfo[5]);


            document.getElementsByClassName("rich-presence-time-start")[0].innerHTML = ConvertIntoTimestamp(currentTime - currentrpcinfo[5]);
            document.getElementsByClassName("rich-presence-time-end")[0].innerHTML = ConvertIntoTimestamp(songDuration);

            let percentage = (((currentTime - currentrpcinfo[5]) - 0) / (songDuration - 0) * 100);

            document.querySelector(".rich-presence-time-graphics-elapsed").style.width = percentage + "%";
        }
    }
});

RegularlyCheckForRichPresence();
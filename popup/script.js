let isRPCRunning = false;
let isRPCShown = false;
let isScrollRunning = false;
let firstUpdate = true;
let hasLaunched = false;

const manifest = browser.runtime.getManifest()
const versionNumber = manifest.version;

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
    if (value === 0) return '0 seconds';
    
    const units = [
        { value2: Math.floor(value / 86400), label: 'day' },
        { value2: Math.floor((value % 86400) / 3600), label: 'hour' },
        { value2: Math.floor((value % 3600) / 60), label: 'minute' },
        { value2: value % 60, label: 'second' }
    ];
    
    const parts = units.map(unit => {
        if (unit.value2 === 0) return null;
        return `${unit.value2} ${unit.label}${unit.value2 !== 1 ? 's' : ''}`;
    }).filter(part => part !== null);
    
    if (parts.length === 1) return parts[0];
    
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

    aboutContainer.querySelector("#about-container-data p.plus-main-text").textContent = `Version ${versionNumber}`;
}, { once: true });

try {
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === "SEND_POPUP_INFO") {
            console.log("[Popup] Received: " + message.content);
            if (message.content === "STATUS: ALIVE") {
                document.getElementById("app-status").classList.add("success");
                document.getElementById("app-status-text").textContent = "Connected";
                document.getElementById("stats-container").style.display = "flex";
                if (hasLaunched == false) {
                    GetRichPresence();
                    GetFullConfig();
                    GetListeningDataStats();
                }
                hasLaunched = true;
                gotHeartbeatResponse = true;
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
                } else {
                    document.getElementById("main-container-background").style.background = "radial-gradient(circle at 67% 100%, #2e004ddc 0%, #0000 66%), radial-gradient(circle at 0% 100%, #19005fd3 0%, #0000 66%) 50% 50% / cover no-repeat";
                    document.getElementById("main-container-background").style.filter = "saturate(100%)";
                    document.getElementById("main-container-background").style.opacity = "1";
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
                message.content = message.content.replace("APPVERSION: ", "");

                var aboutContainer = document.getElementById("about-container");
                let versionText = aboutContainer.querySelector("#about-container-data p.plus-main-text");

                versionText.textContent = `Version: ${versionNumber} | App Version: ${message.content}`;

                let shortVersionNumber = versionNumber.slice(0, 4);
                let shortAppVersionNumber = message.content.slice(0, 4);
                if (shortVersionNumber != shortAppVersionNumber) { document.getElementById("about-container-app-warning").style.display = "block" }
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

                try { ldstats = JSON.parse(message.content); } catch {
                    let h3Element = document.createElement("h3");
                    h3Element.textContent = "No data present. Play a song for 60 seconds and enable listening data in configuration if it is disabled.";
                    h3Element.style.color = "#999";
                    h3Element.style.marginTop = "4px";
                    h3Element.style.marginBottom = "4px";
                    statsDataDiv.appendChild(h3Element);
                }

                if (ldstats) {
                    for ([key, value] of Object.entries(ldstats)) {
                        let key_text;
                        let value_text;
                        switch (key)
                        {
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
                                key_text = "Video"
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
                        h3Element.appendChild(spanElement)
                    }
                }

                if (!document.getElementById("stats-container").classList.contains("closed")) {
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
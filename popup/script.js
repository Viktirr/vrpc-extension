document.addEventListener("DOMContentLoaded", () => {
    browser.runtime.sendMessage({
        type: "GET_POPUP_INFO",
        content: "CHECK_APP_HEARTBEAT"
    });
    document.getElementById("app-status-text").innerHTML = "Connecting";
});

browser.runtime.onMessage.addListener((message) => {
    if (message.type === "SEND_POPUP_INFO") {
        console.log("[Popup] Received: " + message.content);
        if (message.content === "ALIVE") {
            document.getElementById("app-status").classList.add("success");
            document.getElementById("app-status-text").innerHTML = "Connected";
        }
        if (message.content === "FAILED") {
            document.getElementById("app-status").classList.add("failed");
            document.getElementById("app-status-text").innerHTML = "Failed";
        }
    }
});
function GetRichPresence() {
    console.log("[Popup] Get RPC Info")
    browser.runtime.sendMessage({
        type: "SEND_TO_APP",
        content: "GET_RPC_INFO"
    });
}

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
            message.content = message.content.replace("RPC: ", "");
            currentrpcinfo = message.content.split("  .  ");
            document.getElementsByClassName("rich-presence-text-first")[0].innerHTML = currentrpcinfo[0];
            document.getElementsByClassName("rich-presence-text-third")[0].setAttribute("title",currentrpcinfo[0]);
            document.getElementsByClassName("rich-presence-text-second")[0].innerHTML = currentrpcinfo[1];
            document.getElementsByClassName("rich-presence-text-third")[0].setAttribute("title",currentrpcinfo[1]);
            document.getElementsByClassName("rich-presence-text-third")[0].innerHTML = currentrpcinfo[2];
            document.getElementsByClassName("rich-presence-text-third")[0].setAttribute("title",currentrpcinfo[2]);
            document.getElementsByClassName("rich-presence-image")[0].setAttribute("src",currentrpcinfo[3]);
            document.getElementsByClassName("rich-presence-image")[0].setAttribute("title",currentrpcinfo[2]);
        }
    }
});
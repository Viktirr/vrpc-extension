let port = browser.runtime.connectNative("vrpc");

let AppActive = false;

port.onMessage.addListener((response) => {
  console.log("Received: " + response);
});

// Check if the app is running
function CheckAppHeartbeat()
{
  const timeoutAppResponse = setTimeout(() => {
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "FAILED"
    });
  }, 5000);

  console.log("Checking App Status");

  AppListener = port.onMessage.addListener((response) => {
    if (response === "Alive")
    {
      AppActive = true;
      browser.runtime.sendMessage({
        type: "SEND_POPUP_INFO",
        content: "ALIVE"
      });
    }

    clearTimeout(timeoutAppResponse);

    port.onMessage.removeListener(AppListener);
  });
  
  port.postMessage("Status: \nProgram\nHeartbeat");
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_RPC_INFO") {
    //console.log("RPC Info: " + message.content);
    port.postMessage("RPC: \n" + message.content);
  } else if (message.type === "GET_STATUS_INFO") {
    console.log("Status Info: " + message.content);
    port.postMessage("Status: \n" + message.content);
  } else if (message.type === "GET_POPUP_INFO") {
    if (message.content === "CHECK_APP_HEARTBEAT") {
      CheckAppHeartbeat();
    }
  }
});

browser.runtime.onSuspend.addListener(() => {
  port.postMessage("Status: \n" + "Program\nShutdown");
});

browser.windows.onRemoved.addListener((windowId) => {
  port.postMessage("Status: \n" + "Program\nShutdown");
});
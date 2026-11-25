// The update notice page. It explains the opt-in automatic install and forwards
// the choice to the app through the existing native-messaging bridge.
if (typeof browser === "undefined") {
  var browser = chrome;
}

const statusElement = document.getElementById("status");
const enableButton = document.getElementById("enable-auto");
const manualButton = document.getElementById("keep-manual");

function SetStatus(text) {
  if (statusElement) { statusElement.textContent = text; }
}

async function SendChoice(enabled) {
  try {
    const response = await browser.runtime.sendMessage({ type: "SET_UNATTENDED_UPDATES", enabled });
    return !!(response && response.ok);
  } catch (e) {
    console.log("Couldn't send the unattended-update choice: " + e);
    return false;
  }
}

if (enableButton) {
  enableButton.addEventListener("click", async () => {
    enableButton.disabled = true;
    const ok = await SendChoice(true);
    enableButton.disabled = false;

    if (ok) {
      SetStatus("Automatic installs are enabled. You can change this later in the extension popup under Configuration → Updates.");
    } else {
      SetStatus("VRPC could not be reached. Start VRPC, then enable it in the extension popup under Configuration → Updates.");
    }
  });
}

if (manualButton) {
  manualButton.addEventListener("click", async () => {
    manualButton.disabled = true;
    await SendChoice(false);
    manualButton.disabled = false;
    SetStatus("No automatic installs. You can enable this later in the extension popup under Configuration → Updates.");
  });
}

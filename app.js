// 1. YOUR GOOGLE APPS SCRIPT WEB APP URL (Verified Link)
const API_URL = "https://script.google.com/macros/s/AKfycbyOm02wepjqjwNJua6Jv8fgIAYCv86EjmhuvKbllPDd2_9Cri2i4rF5lbb3sosJZI3yRQ/exec";

// Master list arrays cached locally for interface filters
let globalProperties = [];
let activeSubTabs = { projects: "proj-all", shopping: "shop-crew" };

// Track submissions that have been sent to Google Sheets but not yet confirmed
const pendingSubmissions = new Map();
let pendingRefreshTimer = null;


// MAIN PARENT TAB NAVIGATION ROUTING
function openMainTab(evt, tabName) {
    const tabcontents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabcontents.length; i++) {
        tabcontents[i].style.display = "none";
    }

    const tablinks = document.getElementsByClassName("tab-link");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";

    closeAllCombos();
}


// NESTED CHILD SUB-TAB NAVIGATION ROUTING
function openSubTab(evt, parentId, subTabId) {
    const parentContainer = document.getElementById(parentId);
    const subContents = parentContainer.getElementsByClassName("sub-tab-content");

    for (let i = 0; i < subContents.length; i++) {
        subContents[i].style.display = "none";
    }

    const subLinks = parentContainer.getElementsByClassName("sub-tab-link");
    for (let i = 0; i < subLinks.length; i++) {
        subLinks[i].className = subLinks[i].className.replace(" active", "");
    }

    document.getElementById(subTabId).style.display = "block";
    evt.currentTarget.className += " active";
    activeSubTabs[parentId] = subTabId;

    // When a specific Projects category is selected, automatically
    // set the Add Project category selector to match that tab.
    if (parentId === "projects" && subTabId !== "proj-all") {
        const projectTypeSelect = document.getElementById("project-type");
        if (projectTypeSelect) {
            projectTypeSelect.value = subTabId;
        }
    }
}


// SEARCHABLE COMBOBOX DROPDOWN PROCESSING SCRIPTS
function toggleCombo(inputEl) {
    closeAllCombos();

    const dropdown = inputEl.parentElement.querySelector(".combo-dropdown");
    dropdown.style.display = "block";

    renderComboItems(dropdown, globalProperties, inputEl);
}


function arrowToggleCombo(btnEl, event) {
    event.stopPropagation();

    const input = btnEl.parentElement.querySelector(".combo-input");
    toggleCombo(input);
}


function filterCombo(inputEl) {
    const dropdown = inputEl.parentElement.querySelector(".combo-dropdown");
    const val = inputEl.value.toLowerCase().trim();

    const filtered = globalProperties.filter(property =>
        property.toLowerCase().includes(val)
    );

    renderComboItems(dropdown, filtered, inputEl);
}


function renderComboItems(dropdown, list, inputEl) {
    if (list.length === 0) {
        dropdown.innerHTML =
            '<div class="combo-item" style="color:#888; font-style:italic;">No matches found</div>';
        return;
    }

    dropdown.innerHTML = list
        .map(item =>
            `<div class="combo-item" onclick="selectComboItem('${item.replace(/'/g, "\\'")}', '${inputEl.id}')">${item}</div>`
        )
        .join('');
}


function selectComboItem(value, inputId) {
    const input = document.getElementById(inputId);

    input.value = value;
    closeAllCombos();
}


function closeAllCombos() {
    const drawers = document.getElementsByClassName("combo-dropdown");

    for (let i = 0; i < drawers.length; i++) {
        drawers[i].style.display = "none";
    }
}


document.addEventListener("click", function (e) {
    if (!e.target.closest(".combobox-wrapper")) {
        closeAllCombos();
    }
});


// JSONP CHANNEL DATA RECEIVERS
function handlePropertyOptions(properties) {
    globalProperties = properties;

    // Safely update an open combo list if a dropdown is active during load
    const activeInput = document.activeElement;

    if (activeInput && activeInput.classList.contains("combo-input")) {
        filterCombo(activeInput);
    }
}


function handleSheetData(items) {
    try {
        const subCategories = [
            "overview",
            "proj-all-oneoff",
            "proj-all-current",
            "proj-all-upcoming",
            "proj-all-major",
            "proj-oneoff",
            "proj-current",
            "proj-upcoming",
            "proj-major",
            "issue",
            "walkthrough",
            "shop-crew",
            "shop-steph"
        ];

        const projectAllContainers = {
            "proj-oneoff": "proj-all-oneoff-container",
            "proj-current": "proj-all-current-container",
            "proj-upcoming": "proj-all-upcoming-container",
            "proj-major": "proj-all-major-container"
        };

        const counts = {
            projects: 0,
            issue: 0,
            walkthrough: 0,
            shopping: 0
        };

        // Clear containers only after fresh data has actually arrived.
        subCategories.forEach(category => {
            const el = document.getElementById(`${category}-container`);
            if (el) {
                el.innerHTML = "";
            }
        });

        const urgentStream = document.getElementById("urgent-stream-container");

        if (urgentStream) {
            urgentStream.innerHTML = "";
        }

        let overviewCount = 0;
        let overviewHtml = "";

        items.forEach(item => {
            const cleanId =
                item.id || Math.random().toString(36).substring(2, 9);

            if (item.type.startsWith("proj-")) {
                counts.projects++;
            }

            if (item.type === "issue") {
                counts.issue++;
            }

            if (item.type === "walkthrough") {
                counts.walkthrough++;
            }

            if (item.type.startsWith("shop-")) {
                counts.shopping++;
            }

            const cardHtml = `
                <div class="task-card ${item.type}-card" id="card-${cleanId}">
                    <div class="task-details">
                        <div class="property-name">${item.property}</div>
                        <div class="task-text">${item.text}</div>
                    </div>
                    <button class="done-btn" onclick="removeCard(this, '${cleanId}')">Complete</button>
                </div>
            `;

            // Normal category-specific view
            const container = document.getElementById(`${item.type}-container`);

            if (container) {
                container.innerHTML += cardHtml;
            }

            // Also place Projects into the matching grouped section of All.
            const allProjectContainerId = projectAllContainers[item.type];

            if (allProjectContainerId) {
                const allProjectContainer =
                    document.getElementById(allProjectContainerId);

                if (allProjectContainer) {
                    allProjectContainer.innerHTML += cardHtml;
                }
            }

            // Overview Dashboard feed generation rules
            if (
                item.type === "overview" ||
                item.type === "issue" ||
                item.type === "walkthrough" ||
                overviewCount < 3
            ) {
                if (!item.type.startsWith("shop-")) {
                    overviewHtml += cardHtml;
                    overviewCount++;
                }
            }
        });

        const cProj = document.getElementById("count-projects");
        const cIss = document.getElementById("count-issue");
        const cWalk = document.getElementById("count-walkthrough");
        const cShop = document.getElementById("count-shopping");

        if (cProj) {
            cProj.innerText = counts.projects;
        }

        if (cIss) {
            cIss.innerText = counts.issue;
        }

        if (cWalk) {
            cWalk.innerText = counts.walkthrough;
        }

        if (cShop) {
            cShop.innerText = counts.shopping;
        }

        // Empty-state messages for every register, including each All section.
        subCategories.forEach(category => {
            const container = document.getElementById(`${category}-container`);

            if (container && container.innerHTML === "") {
                container.innerHTML =
                    '<div class="loading-placeholder">No active items inside this register.</div>';
            }
        });

        if (urgentStream) {
            urgentStream.innerHTML =
                overviewHtml ||
                '<div class="loading-placeholder">Dashboard operational clear. No tasks pending.</div>';
        }

        checkPendingSubmissions(items);

    } catch (error) {
        console.error("Layout engine error trace:", error);
    }
}


// DASHBOARD DATA LOADING
function loadDashboard(showLoading = true, loadProperties = true) {
    if (!API_URL || API_URL === "") {
        return;
    }

    if (loadProperties) {
        const oldPropScript =
            document.getElementById("property-jsonp-script");

        if (oldPropScript) {
            oldPropScript.remove();
        }

        const propScript = document.createElement("script");
        propScript.id = "property-jsonp-script";
        propScript.src =
            `${API_URL}?getData=properties&callback=handlePropertyOptions&nocache=${Date.now()}`;

        document.body.appendChild(propScript);
    }

    if (showLoading) {
        const subCategories = [
            "proj-all-oneoff",
            "proj-all-current",
            "proj-all-upcoming",
            "proj-all-major",
            "proj-oneoff",
            "proj-current",
            "proj-upcoming",
            "proj-major",
            "issue",
            "walkthrough",
            "shop-crew",
            "shop-steph"
        ];

        subCategories.forEach(category => {
            const container =
                document.getElementById(`${category}-container`);

            if (container) {
                container.innerHTML =
                    '<div class="loading-placeholder">Syncing data...</div>';
            }
        });
    }

    const oldScript = document.getElementById("jsonp-script");

    if (oldScript) {
        oldScript.remove();
    }

    const script = document.createElement("script");
    script.id = "jsonp-script";
    script.src =
        `${API_URL}?getData=tasks&callback=handleSheetData&nocache=${Date.now()}`;

    document.body.appendChild(script);
}



// SUBMISSION PIPELINE ROUTERS
function addCustomItem(typeKey, propInputId, textInputId) {
    executeFormPost(typeKey, propInputId, textInputId);
}


function addContextualItem(parentTabKey, propInputId, textInputId) {
    const contextualType = activeSubTabs[parentTabKey];

    executeFormPost(contextualType, propInputId, textInputId);
}

function addProjectItem(propInputId, textInputId, typeSelectId) {
    const typeSelect = document.getElementById(typeSelectId);

    if (!typeSelect) {
        console.error("Project category selector not found.");
        return;
    }

    const targetType = typeSelect.value;
    const allowedTypes = new Set([
        "proj-oneoff",
        "proj-current",
        "proj-upcoming",
        "proj-major"
    ]);

    if (!allowedTypes.has(targetType)) {
        alert("Please select a valid project category.");
        return;
    }

    executeFormPost(targetType, propInputId, textInputId);
}

// SEND NEW ITEM TO GOOGLE SHEETS
async function executeFormPost(targetType, propId, textId) {
    const propertyInput = document.getElementById(propId);
    const textInput = document.getElementById(textId);

    const property = propertyInput.value.trim();
    const text = textInput.value.trim();

    if (!property || !text) {
        alert("Please complete both the property and task description.");
        return;
    }

    const formRow = textInput.closest(".form-row");
    const button = formRow.querySelector(".action-btn");
    const form = formRow.closest(".inline-form");

    // Create a reusable status line under this form if one does not exist.
    let status = form.querySelector(".form-status");

    if (!status) {
        status = document.createElement("div");
        status.className = "form-status";
        form.appendChild(status);
    }

    const originalButtonText = button.innerText;

    // Generate a unique ID so we can confirm this exact item came back.
    const cleanId =
        (typeof crypto !== "undefined" && crypto.randomUUID)
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 12);

    const payload = {
        action: "add",
        id: cleanId,
        property: property,
        text: text,
        type: targetType
    };

    // Keep the entered values visible, but lock the form while saving.
    propertyInput.disabled = true;
    textInput.disabled = true;
    button.disabled = true;

    button.innerText = "Submitting...";
    status.className = "form-status saving";
    status.innerText = "Saving to Google Sheets...";

    pendingSubmissions.set(cleanId, {
        propertyInput,
        textInput,
        button,
        status,
        originalButtonText,
        startedAt: Date.now()
    });

    try {
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload)
        });

        button.innerText = "Submitted ✓";
        status.className = "form-status syncing";
        status.innerText =
            "Submitted — waiting for dashboard sync...";

        schedulePendingRefresh();

    } catch (error) {
        console.error("Posting data error:", error);

        pendingSubmissions.delete(cleanId);

        propertyInput.disabled = false;
        textInput.disabled = false;
        button.disabled = false;
        button.innerText = originalButtonText;

        status.className = "form-status error";
        status.innerText =
            "Could not submit. Please try again.";
    }
}


// CHECK GOOGLE SHEETS AGAIN WITHOUT BLANKING THE PAGE
function schedulePendingRefresh() {
    if (pendingRefreshTimer) {
        return;
    }

    pendingRefreshTimer = setTimeout(() => {
        pendingRefreshTimer = null;

        // Silent refresh:
        // keep existing cards visible and skip property-list reloading.
        loadDashboard(false, false);

    }, 600);
}


// VERIFY THAT THE EXACT NEW ITEM HAS COME BACK FROM GOOGLE SHEETS
function checkPendingSubmissions(items) {
    if (pendingSubmissions.size === 0) {
        return;
    }

    const returnedIds = new Set(
        items.map(item => String(item.id).trim())
    );

    let stillWaiting = false;

    pendingSubmissions.forEach((pending, id) => {
        // Success: Google Sheets has returned the exact item submitted.
        if (returnedIds.has(id)) {
            pending.propertyInput.value = "";
            pending.textInput.value = "";

            pending.propertyInput.disabled = false;
            pending.textInput.disabled = false;
            pending.button.disabled = false;

            pending.button.innerText = pending.originalButtonText;

            pending.status.className = "form-status success";
            pending.status.innerText = "✓ Added and synced";

            pendingSubmissions.delete(id);

            // Put the cursor back into the property field.
            pending.propertyInput.focus();

            setTimeout(() => {
                pending.status.innerText = "";
                pending.status.className = "form-status";
            }, 2500);

            return;
        }

        // Keep checking for up to 15 seconds.
        if (Date.now() - pending.startedAt < 15000) {
            stillWaiting = true;
            return;
        }

        // We cannot confidently say the POST failed because no-cors
        // prevents JavaScript from reading the POST response.
        pending.propertyInput.disabled = false;
        pending.textInput.disabled = false;
        pending.button.disabled = false;

        pending.button.innerText = pending.originalButtonText;

        pending.status.className = "form-status error";
        pending.status.innerText =
            "Still waiting for Google Sheets. Your entry has been left in the form.";

        pendingSubmissions.delete(id);
    });

    if (stillWaiting) {
        schedulePendingRefresh();
    }
}


// REMOVE / COMPLETE AN ITEM
async function removeCard(buttonElement, itemId) {
    const card = buttonElement.closest(".task-card");

    buttonElement.disabled = true;
    buttonElement.innerText = "Syncing...";
    card.style.opacity = "0";

    try {
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify({
                action: "delete",
                id: itemId
            })
        });

        // Give Apps Script a moment to complete the row deletion,
        // then refresh silently so badge counts and duplicate Overview
        // cards are also updated.
        setTimeout(() => {
            loadDashboard(false, false);
        }, 700);

    } catch (error) {
        console.error("Removal failure log:", error);

        card.style.opacity = "1";
        buttonElement.disabled = false;
        buttonElement.innerText = "Complete";
    }
}

// BOOT CONFIGURATION
loadDashboard();

const database = firebase.database();
const eventRef = database.ref('birthdayEvent');
let currentUser = null;
let invitedGuestsList = [];
let partnerships = [];

// Cached DOM Elements
let loginFormEl, userInfoEl, mainContentEl, eventInfoSectionEl, currentUserNameEl, nameFormEl, loginErrorEl, eventTitleEl, activitiesContainerEl, invitedGuestsListEl, invitedCountEl, burgerMenuBtnEl, guestSliderEl;

// Helper function to find a partner
function findPartner(userName) {
    if (!partnerships || partnerships.length === 0) return null;
    const partnership = partnerships.find(p => p.person1 === userName || p.person2 === userName);
    if (partnership) {
        return partnership.person1 === userName ? partnership.person2 : partnership.person1;
    }
    return null;
}

// Handle user login
function handleLogin(userName) {
    currentUser = userName;
    localStorage.setItem('currentUser', userName);
    
    loginFormEl.style.display = 'none';
    userInfoEl.style.display = 'flex'; // Change display to flex for column layout
    mainContentEl.style.display = 'block';
    eventInfoSectionEl.style.display = 'block';
    currentUserNameEl.innerHTML = `<strong>${userName}</strong>`;
}

// Handle user logout
function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    loginFormEl.style.display = 'block';
    userInfoEl.style.display = 'none';
    mainContentEl.style.display = 'none';
    eventInfoSectionEl.style.display = 'none';
    nameFormEl.reset();
}

// Check for existing session
function checkSession() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        handleLogin(savedUser);
    }
}

// Fetch data from Firebase
async function fetchData() {
    try {
        const response = await fetch('data.json');
        const localConfigData = await response.json();
        
        const firebaseSnapshot = await eventRef.once('value');
        const firebaseEventData = firebaseSnapshot.val();

        if (!firebaseSnapshot.exists() || !firebaseEventData) {
            if (localConfigData.activities && Array.isArray(localConfigData.activities)) {
                localConfigData.activities.forEach(activity => {
                    activity.partnerAdditions = activity.partnerAdditions || {};
                });
            }
            await eventRef.set(localConfigData);
            return localConfigData;
        }
        
        const mergedEventData = {
            eventName: localConfigData.eventName,
            activities: []
        };

        const localActivities = Array.isArray(localConfigData.activities) ? localConfigData.activities : [];

        for (const localActivity of localActivities) {
            const firebaseExistingActivity = (firebaseEventData.activities && Array.isArray(firebaseEventData.activities)) ?
                                         firebaseEventData.activities.find(fa => fa.id === localActivity.id) :
                                         undefined;

            let guests = [];
            let partnerAdditions = {};

            if (firebaseExistingActivity) {
                if (Array.isArray(firebaseExistingActivity.guests)) {
                    guests = firebaseExistingActivity.guests;
                }
                if (typeof firebaseExistingActivity.partnerAdditions === 'object' && firebaseExistingActivity.partnerAdditions !== null) {
                    partnerAdditions = firebaseExistingActivity.partnerAdditions;
                } 
            } else if (Array.isArray(localActivity.guests)) {
                guests = localActivity.guests;
            }

            mergedEventData.activities.push({
                id: localActivity.id,
                name: localActivity.name,
                time: localActivity.time,
                location: localActivity.location,
                description: localActivity.description,
                isConfirmed: localActivity.isConfirmed,
                guests: guests,
                partnerAdditions: partnerAdditions
            });
        }
        
        await eventRef.set(mergedEventData);
        return mergedEventData;

    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

// Create activity cards
function createActivityCard(activity) {
    const card = document.createElement('div');
    card.className = 'activity-card';
    
    const guests = Array.isArray(activity.guests) ? activity.guests : [];
    const isAttending = guests.includes(currentUser);
    const currentUserPartner = findPartner(currentUser);

    card.innerHTML = `
        <h2>${activity.name}</h2>
        <div class="activity-info">
            <p><strong>Tid:</strong> ${activity.time}</p>
            <p><strong>Plats:</strong> ${activity.location}</p>
            <p class="activity-description">${(activity.description || 'Ingen ytterligare information.').replace(/\n/g, '<br>')}</p> 
        </div>
        <h3>Gäster (${guests.length}):</h3>
        <ul class="guest-list" id="guests-${activity.id}">
            ${guests.map(guest => `<li>${guest}</li>`).join('')}
        </ul>
    `;

    const actionContainer = document.createElement('div');
    actionContainer.className = 'action-container';

    if (isAttending) {
        const linkedPartnerName = activity.partnerAdditions?.[currentUser];
        if (currentUserPartner && linkedPartnerName === currentUserPartner && guests.includes(currentUserPartner)) {
            const removeBothButton = document.createElement('button');
            removeBothButton.className = 'remove';
            removeBothButton.textContent = `Avanmäl mig och ${currentUserPartner}`;
            removeBothButton.addEventListener('click', async () => {
                await removeGuestFromActivity(activity.id, true);
            });
            actionContainer.appendChild(removeBothButton);
        } else {
            const removeSelfButton = document.createElement('button');
            removeSelfButton.className = 'remove';
            removeSelfButton.textContent = 'Avanmäl mig';
            removeSelfButton.addEventListener('click', async () => {
                await removeGuestFromActivity(activity.id, false);
            });
            actionContainer.appendChild(removeSelfButton);

            if (currentUserPartner && !guests.includes(currentUserPartner)) {
                const addPartnerOnlyButton = document.createElement('button');
                addPartnerOnlyButton.textContent = `Anmäl ${currentUserPartner} också`;
                addPartnerOnlyButton.addEventListener('click', async () => {
                    await addGuestToActivity(activity.id, true, true); 
                });
                actionContainer.appendChild(addPartnerOnlyButton);
            }
        }
    } else {
        const rsvpButton = document.createElement('button');
        rsvpButton.textContent = 'Jag kommer!';
        let shouldAddPartner = false;

        if (currentUserPartner) {
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'partner-checkbox-container';

            const partnerCheckbox = document.createElement('input');
            partnerCheckbox.type = 'checkbox';
            partnerCheckbox.id = `partner-checkbox-${activity.id}`;
            partnerCheckbox.checked = false;
            
            partnerCheckbox.addEventListener('change', () => {
                if (partnerCheckbox.checked) {
                    rsvpButton.textContent = `Jag och ${currentUserPartner} kommer!`;
                    shouldAddPartner = true;
                } else {
                    rsvpButton.textContent = 'Jag kommer!';
                    shouldAddPartner = false;
                }
            });

            const partnerLabel = document.createElement('label');
            partnerLabel.htmlFor = `partner-checkbox-${activity.id}`;
            partnerLabel.textContent = ` Anmäl ${currentUserPartner} också?`;
            partnerLabel.style.marginLeft = '5px';

            checkboxContainer.appendChild(partnerCheckbox);
            checkboxContainer.appendChild(partnerLabel);
            actionContainer.appendChild(checkboxContainer);
        }

        rsvpButton.addEventListener('click', async () => {
            await addGuestToActivity(activity.id, shouldAddPartner);
        });
        actionContainer.appendChild(rsvpButton);
    }
    
    card.appendChild(actionContainer); 
    
    return card;
}

// Add guest to activity
async function addGuestToActivity(activityId, addPartner = false, addingPartnerToExistingUser = false) { 
    if (!currentUser && !addingPartnerToExistingUser) return;
    if (addingPartnerToExistingUser && !currentUser) {
        console.error("Cannot add partner if current user is not defined and already attending.");
        return;
    }

    try {
        const snapshot = await eventRef.once('value');
        const eventData = snapshot.val();
        
        if (!eventData || !eventData.activities || !Array.isArray(eventData.activities)) {
            console.error('Error: Invalid event data structure for adding guest.');
            return;
        }

        const activityIndex = eventData.activities.findIndex(a => a.id === activityId);
        
        if (activityIndex === -1) {
            console.error(`Error: Activity with ID ${activityId} not found.`);
            return;
        }
            
        const activity = eventData.activities[activityIndex];
        activity.guests = Array.isArray(activity.guests) ? activity.guests : [];
        activity.partnerAdditions = typeof activity.partnerAdditions === 'object' && activity.partnerAdditions !== null 
                                      ? activity.partnerAdditions 
                                      : {};
            
        const userToAdd = currentUser;

        if (!addingPartnerToExistingUser) {
            if (userToAdd && !activity.guests.includes(userToAdd)) {
                activity.guests.push(userToAdd);
                showCelebration();
            }
        }

        const partner = findPartner(userToAdd);

        if (addPartner && partner) {
            if (!activity.guests.includes(partner)) {
                activity.guests.push(partner);
            }
            activity.partnerAdditions[userToAdd] = partner;
        } else if (!addPartner && !addingPartnerToExistingUser) {
            if (activity.partnerAdditions[userToAdd]) {
                delete activity.partnerAdditions[userToAdd];
            }
        }
            
        const updates = {};
        updates[`/activities/${activityIndex}/guests`] = activity.guests;
        updates[`/activities/${activityIndex}/partnerAdditions`] = activity.partnerAdditions;
        await eventRef.update(updates);

    } catch (error) {
        console.error('Error adding guest(s):', error);
    }
}

// Remove guest from activity
async function removeGuestFromActivity(activityId, removeLinkedPartner = false) {
    if (!currentUser) return; 
    try {
        const snapshot = await eventRef.once('value');
        const eventData = snapshot.val();

        if (!eventData || !eventData.activities || !Array.isArray(eventData.activities)) {
            console.error('Error: Invalid event data structure for removing guest.');
            return;
        }

        const activityIndex = eventData.activities.findIndex(a => a.id === activityId);

        if (activityIndex === -1) {
            console.error(`Error: Activity with ID ${activityId} not found for removal.`);
            return;
        }
            
        const activity = eventData.activities[activityIndex];
        activity.guests = Array.isArray(activity.guests) ? activity.guests : [];
        activity.partnerAdditions = typeof activity.partnerAdditions === 'object' && activity.partnerAdditions !== null 
                                      ? activity.partnerAdditions 
                                      : {};

        const partnerToRemoveViaLink = activity.partnerAdditions[currentUser];

        const initialGuestCount = activity.guests.length;
        activity.guests = activity.guests.filter(guest => guest !== currentUser);
            
        if (removeLinkedPartner && partnerToRemoveViaLink && activity.guests.includes(partnerToRemoveViaLink)) {
             activity.guests = activity.guests.filter(guest => guest !== partnerToRemoveViaLink);
        }
            
        if (activity.partnerAdditions[currentUser]) {
            delete activity.partnerAdditions[currentUser];
        }
            
        if (activity.guests.length !== initialGuestCount || activity.partnerAdditions[currentUser] === undefined) {
            const updates = {};
            updates[`/activities/${activityIndex}/guests`] = activity.guests;
            updates[`/activities/${activityIndex}/partnerAdditions`] = activity.partnerAdditions;
            await eventRef.update(updates);
        }

    } catch (error) {
        console.error('Error removing guest(s):', error);
    }
}

// Display Invited Guests
function displayInvitedGuests(invitedGuestsData) {
    const invitedListElement = invitedGuestsListEl;
    const invitedCountElement = invitedCountEl;

    if (!invitedListElement || !invitedCountElement || !Array.isArray(invitedGuestsData)) {
        console.error("Could not find elements to display invited guests or data is invalid.");
        return;
    }

    invitedListElement.innerHTML = '';
    invitedGuestsData.forEach(guestName => {
        const listItem = document.createElement('li');
        listItem.textContent = guestName;
        invitedListElement.appendChild(listItem);
    });

    invitedCountElement.textContent = invitedGuestsData.length;
}

// Update UI with new data
function updateUI(data) {
    eventTitleEl.textContent = data.eventName;

    const container = activitiesContainerEl;
    container.innerHTML = '';
    if (data.activities && Array.isArray(data.activities)) {
        const confirmedActivities = data.activities.filter(activity => activity.isConfirmed === true);
        
        confirmedActivities.forEach(activity => {
            container.appendChild(createActivityCard(activity));
        });
    } else {
        console.warn("No activities found or data format incorrect.");
    }
}

// Initialize the application
async function initializeApp() {
    loginFormEl = document.getElementById('loginForm');
    userInfoEl = document.getElementById('userInfo');
    mainContentEl = document.getElementById('mainContent');
    eventInfoSectionEl = document.getElementById('eventInfoSection');
    currentUserNameEl = document.getElementById('currentUserName');
    nameFormEl = document.getElementById('nameForm');
    loginErrorEl = document.getElementById('loginError');
    eventTitleEl = document.getElementById('eventTitle');
    activitiesContainerEl = document.getElementById('activitiesContainer');
    invitedGuestsListEl = document.getElementById('invitedGuestsList');
    invitedCountEl = document.getElementById('invitedCount');
    burgerMenuBtnEl = document.getElementById('burgerMenuBtn');
    guestSliderEl = document.getElementById('guestSlider');

    checkSession();
    
    let initialJsonData = {};
    try {
        const response = await fetch('data.json');
        initialJsonData = await response.json();
        invitedGuestsList = initialJsonData.invitedGuests || [];
        partnerships = initialJsonData.partnerships || [];
    } catch (error) {
        console.error('Error fetching initial data.json:', error);
        partnerships = []; 
    }

    if (initialJsonData.invitedGuests) {
        displayInvitedGuests(initialJsonData.invitedGuests);
    }
    
    const data = await fetchData();
    if (!data) return;

    updateUI(data);

    eventRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (initialJsonData.partnerships) partnerships = initialJsonData.partnerships;
            updateUI(data);
        }
    });

    const nameForm = nameFormEl;
    const loginErrorElement = loginErrorEl;

    nameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userNameInput = document.getElementById('userName').value.trim();
        loginErrorElement.textContent = '';
        loginErrorElement.style.display = 'none';

        if (!userNameInput) {
             loginErrorElement.textContent = 'Vänligen ange ditt namn.';
             loginErrorElement.style.display = 'block';
             return;
        }

        const foundGuest = invitedGuestsList.find(guest => 
            guest.toLowerCase() === userNameInput.toLowerCase()
        );

        if (foundGuest) {
            handleLogin(foundGuest); 

            const snapshot = await eventRef.once('value');
            const currentData = snapshot.val();
            if (currentData) {
                if (initialJsonData.partnerships) partnerships = initialJsonData.partnerships;
                updateUI(currentData);
            }
            
        } else {
            loginErrorElement.textContent = 'Namnet finns inte på gästlistan. Kontrollera stavningen.';
            loginErrorElement.style.display = 'block';
        }
    });

    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    const burgerBtn = burgerMenuBtnEl;
    const guestSlider = guestSliderEl;

    if (burgerBtn && guestSlider) {
        burgerBtn.addEventListener('click', () => {
            guestSlider.classList.toggle('open');
            burgerBtn.classList.toggle('is-active');
        });
    }

    document.addEventListener('click', (event) => {
        if (guestSlider && guestSlider.classList.contains('open') && 
            !guestSlider.contains(event.target) && 
            event.target !== burgerBtn && !burgerBtn.contains(event.target)) {
            guestSlider.classList.remove('open');
        }
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);

function showCelebration() {
    const celebration = document.createElement('div');
    celebration.classList.add('celebration');
    document.body.appendChild(celebration);

    setTimeout(() => {
        celebration.classList.add('show');

        for (let i = 0; i < 200; i++) {
            createConfetti(celebration);
        }

        setTimeout(() => {
            celebration.remove();
        }, 5000);
    }, 100);
}

function createConfetti(container) {
    const confetti = document.createElement('div');
    confetti.classList.add('confetti');

    const left = Math.random() * 100 + 'vw';

    const colors = ['var(--primary)', 'var(--accent)', '#ff9a8b', '#a3d0c3', '#f9d71c', '#ff6b6b', '#4ecdc4', '#ffc0cb', '#7b68ee', '#32cd32'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const size = Math.random() * 10 + 5 + 'px';

    const rotation = Math.random() * 360 + 'deg';

    const shapes = ['square', 'circle'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    confetti.style.left = left;
    confetti.style.backgroundColor = color;
    confetti.style.width = size;
    confetti.style.height = size;
    confetti.style.transform = `rotate(${rotation})`;
    confetti.style.borderRadius = shape === 'circle' ? '50%' : '0';

    confetti.style.animationDuration = Math.random() * 3 + 2 + 's';

    container.appendChild(confetti);
}
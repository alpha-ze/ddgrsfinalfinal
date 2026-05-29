require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const Database = require('./database-supabase');

const app = express();
const db = new Database();

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const userSessions = new Map();

// Flat subcategory list — user picks a single number
const SUBCATEGORIES = {
    '1':  { category: 'Academics',                 subcategory: 'Teaching' },
    '2':  { category: 'Academics',                 subcategory: 'Examination' },
    '3':  { category: 'Academics',                 subcategory: 'Internal Assessment' },
    '4':  { category: 'Office and Administration', subcategory: 'Fee' },
    '5':  { category: 'Office and Administration', subcategory: 'Scholarships' },
    '6':  { category: 'Office and Administration', subcategory: 'Certificates' },
    '7':  { category: 'Behavioral',                subcategory: 'Bullying / Ragging' },
    '8':  { category: 'Behavioral',                subcategory: 'Threat / Intimidation' },
    '9':  { category: 'Behavioral',                subcategory: 'Defamation' },
    '10': { category: 'Behavioral',                subcategory: 'Substance Abuse' },
    '11': { category: 'Behavioral',                subcategory: 'Sexual / Verbal Harassment' },
    '12': { category: 'Facilities',                subcategory: 'Library' },
    '13': { category: 'Facilities',                subcategory: 'Canteen' },
    '14': { category: 'Facilities',                subcategory: 'Laboratory' },
    '15': { category: 'Facilities',                subcategory: 'Computer Lab' },
    '16': { category: 'Facilities',                subcategory: 'Counselling Centre' },
    '17': { category: 'Facilities',                subcategory: 'Hostel' },
    '18': { category: 'Facilities',                subcategory: 'Washroom' },
    '19': { category: 'Facilities',                subcategory: 'Sports Amenities' },
    '20': { category: 'Campus',                    subcategory: 'Cleanliness' },
    '21': { category: 'Campus',                    subcategory: 'Building' },
    '22': { category: 'Campus',                    subcategory: 'Electrical / Plumbing' }
};

function getCategoryMenuText() {
    return (
        'Select a subcategory:\n\n' +
        '📚 *Academics*\n' +
        '1. Teaching\n' +
        '2. Examination\n' +
        '3. Internal Assessment\n\n' +
        '🏢 *Office and Administration*\n' +
        '4. Fee\n' +
        '5. Scholarships\n' +
        '6. Certificates\n\n' +
        '⚠️ *Behavioral*\n' +
        '7. Bullying / Ragging\n' +
        '8. Threat / Intimidation\n' +
        '9. Defamation\n' +
        '10. Substance Abuse\n' +
        '11. Sexual / Verbal Harassment\n\n' +
        '🏫 *Facilities*\n' +
        '12. Library\n' +
        '13. Canteen\n' +
        '14. Laboratory\n' +
        '15. Computer Lab\n' +
        '16. Counselling Centre\n' +
        '17. Hostel\n' +
        '18. Washroom\n' +
        '19. Sports Amenities\n\n' +
        '🏛️ *Campus*\n' +
        '20. Cleanliness\n' +
        '21. Building\n' +
        '22. Electrical / Plumbing\n\n' +
        'Reply with a number (1-22)'
    );
}

// Webhook endpoint for incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
    const userId = req.body.From;
    const userMessage = req.body.Body.trim();

    console.log(`Message from ${userId}: ${userMessage}`);

    let responseMessage = '';

    // Check for tracking command
    if (userMessage.toLowerCase().startsWith('track ')) {
        const trackingId = userMessage.split(' ')[1];
        const grievance = await db.getGrievanceById(trackingId);

        if (grievance) {
            responseMessage =
                `📋 Grievance Status\n\n` +
                `Tracking ID: ${grievance.grievance_id}\n` +
                `Category: ${grievance.category}\n` +
                `Status: ${grievance.status}\n` +
                `Submitted: ${new Date(grievance.created_at).toLocaleString()}\n\n`;

            if (grievance.response) {
                responseMessage += `Admin Response:\n${grievance.response}\n\n`;
            } else {
                responseMessage += `Your grievance is being reviewed.\n\n`;
            }

            responseMessage += `Type "start" to submit a new grievance.`;
        } else {
            responseMessage = `❌ Tracking ID ${trackingId} not found.\n\nPlease check the ID and try again.`;
        }

        await client.messages.create({
            body: responseMessage,
            from: TWILIO_WHATSAPP_NUMBER,
            to: userId
        });

        return res.status(200).send('OK');
    }

    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: 'start' });
    }

    const session = userSessions.get(userId);

    try {
        if (userMessage.toLowerCase() === 'start' || session.step === 'start') {
            session.step = 'anonymous';
            responseMessage =
                '👋 Welcome to Grievance Management System\n\n' +
                'Do you want to submit anonymously?\n' +
                '1️⃣ Yes (Anonymous)\n' +
                '2️⃣ No (With my details)\n\n' +
                'Reply with 1 or 2';

        } else if (session.step === 'anonymous') {
            if (userMessage === '1') {
                session.isAnonymous = true;
                session.step = 'grievance';
                responseMessage =
                    '✅ Anonymous submission selected\n\n' +
                    '📝 Please describe your grievance:\n' +
                    '(You can send text, images, audio, or video)';
            } else if (userMessage === '2') {
                session.isAnonymous = false;
                session.step = 'grievance';
                responseMessage =
                    '✅ Submission with details\n\n' +
                    '📝 Please describe your grievance:\n' +
                    '(You can send text, images, audio, or video)';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with 1 or 2.';
            }

        } else if (session.step === 'grievance') {
            // Handle media attachments
            const numMedia = parseInt(req.body.NumMedia) || 0;
            let mediaUrls = [];

            for (let i = 0; i < numMedia; i++) {
                const mediaUrl = req.body[`MediaUrl${i}`];
                const mediaType = req.body[`MediaContentType${i}`];
                if (mediaUrl) {
                    mediaUrls.push({ url: mediaUrl, type: mediaType });
                }
            }

            session.grievance = userMessage;
            session.mediaUrls = mediaUrls;
            session.step = 'category';

            let mediaInfo = mediaUrls.length > 0 ? `\n📎 ${mediaUrls.length} attachment(s) received` : '';

            responseMessage = `✅ Grievance recorded${mediaInfo}\n\n` + getCategoryMenuText();

        } else if (session.step === 'category') {
            if (SUBCATEGORIES[userMessage]) {
                const selected = SUBCATEGORIES[userMessage];
                session.categoryName = selected.category;
                session.subcategoryName = selected.subcategory;
                session.department = `${selected.category} - ${selected.subcategory}`;
                session.step = 'confirm';

                let mediaInfo = '';
                if (session.mediaUrls && session.mediaUrls.length > 0) {
                    mediaInfo = `\nAttachments: ${session.mediaUrls.length} file(s)`;
                }

                responseMessage =
                    '📝 Summary:\n\n' +
                    `Category: ${session.categoryName}\n` +
                    `Subcategory: ${session.subcategoryName}\n` +
                    `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                    `Grievance: ${session.grievance}${mediaInfo}\n\n` +
                    'Type "confirm" to submit\n' +
                    'Type "change" to reselect\n' +
                    'Type "cancel" to restart';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with a number between 1-22.';
            }

        } else if (session.step === 'confirm') {
            if (userMessage.toLowerCase() === 'confirm') {
                const displayUserId = session.isAnonymous ? 'Anonymous' : userId;
                const grievanceId = await db.addGrievance({
                    userId: displayUserId,
                    department: session.department,
                    grievance: session.grievance,
                    status: 'Submitted',
                    isAnonymous: session.isAnonymous,
                    mediaUrls: JSON.stringify(session.mediaUrls || [])
                });

                responseMessage =
                    `✅ Your grievance has been submitted!\n` +
                    `Tracking ID: ${grievanceId}\n\n` +
                    `Track your grievance anytime by sending:\n` +
                    `track ${grievanceId}\n\n` +
                    `Type "start" to submit another grievance.`;
                userSessions.delete(userId);

            } else if (userMessage.toLowerCase() === 'change') {
                session.step = 'category';
                responseMessage = getCategoryMenuText();
            } else if (userMessage.toLowerCase() === 'cancel') {
                userSessions.delete(userId);
                responseMessage = '❌ Cancelled. Type "start" to begin again.';
            } else {
                responseMessage = 'Please type "confirm", "change", or "cancel"';
            }
        }

        // Send response via Twilio
        await client.messages.create({
            body: responseMessage,
            from: TWILIO_WHATSAPP_NUMBER,
            to: userId
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).send('Error');
    }
});

// Function to send admin responses back to users
async function sendResponseToUser(userId, message) {
    try {
        await client.messages.create({
            body: `📢 Admin Response:\n\n${message}\n\nThank you for your patience!`,
            from: TWILIO_WHATSAPP_NUMBER,
            to: userId
        });
        console.log(`Response sent to ${userId}`);
        return true;
    } catch (error) {
        console.error('Error sending response:', error);
        return false;
    }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🤖 WhatsApp Grievance Bot running on port ${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`✅ Connected to Supabase`);
    console.log(`⚙️  Set webhook in Twilio Console to your ngrok URL + /webhook`);
});

// Prevent crashes from killing the bot
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

module.exports = { sendResponseToUser };

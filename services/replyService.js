/**
 * replyService.js
 * Stores student replies to admin info requests.
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

async function saveReply(grievanceId, grievanceUUID, userPhone, message) {
    const { error } = await supabase.from('grievance_replies').insert({
        grievance_id: grievanceId,
        grievance_uuid: grievanceUUID,
        user_phone: userPhone,
        message
    });
    if (error) throw new Error('Failed to save reply: ' + error.message);
    console.log(`✅ Reply saved for ${grievanceId} from ${userPhone}`);
}

module.exports = { saveReply };

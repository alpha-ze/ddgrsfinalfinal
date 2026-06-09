/**
 * replyService.js
 * Stores student replies to admin info requests and sends email notification.
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;
const { sendReplyNotificationEmail } = require('./emailService');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

async function saveReply(grievanceId, grievanceUUID, userPhone, message) {
    // Save reply to DB
    const { error } = await supabase.from('grievance_replies').insert({
        grievance_id: grievanceId,
        grievance_uuid: grievanceUUID,
        user_phone: userPhone,
        message
    });
    if (error) throw new Error('Failed to save reply: ' + error.message);

    // Get assigned member to notify
    const { data: grievance } = await supabase
        .from('grievances')
        .select('assigned_member_name, assigned_member_email')
        .eq('grievance_id', grievanceId)
        .single();

    if (grievance?.assigned_member_email) {
        try {
            await sendReplyNotificationEmail({
                toEmail: grievance.assigned_member_email,
                toName: grievance.assigned_member_name || 'Officer',
                grievanceId,
                replyMessage: message
            });
        } catch (e) {
            console.error('Reply email error:', e.message);
        }
    }

    console.log(`✅ Reply saved for ${grievanceId} from ${userPhone}`);
}

module.exports = { saveReply };

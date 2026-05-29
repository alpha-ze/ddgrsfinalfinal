/**
 * assignmentService.js
 * Handles round-robin assignment of grievances to grievance cell members.
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

/**
 * Returns the next active member in round-robin order.
 * Wraps around to the first member if end of list is reached.
 */
async function getNextMember() {
    // Get current tracker
    const { data: tracker, error: trackerErr } = await supabase
        .from('assignment_tracker')
        .select('last_assigned_order')
        .eq('id', 1)
        .single();

    if (trackerErr) throw new Error('Failed to read assignment tracker: ' + trackerErr.message);

    const lastOrder = tracker.last_assigned_order;

    // Try to get the next member after lastOrder
    const { data: nextMembers, error: nextErr } = await supabase
        .from('grievance_members')
        .select('*')
        .eq('active', true)
        .gt('assignment_order', lastOrder)
        .order('assignment_order', { ascending: true })
        .limit(1);

    if (nextErr) throw new Error('Failed to query next member: ' + nextErr.message);

    // If no next member found, wrap around to the first active member
    if (!nextMembers || nextMembers.length === 0) {
        const { data: firstMembers, error: firstErr } = await supabase
            .from('grievance_members')
            .select('*')
            .eq('active', true)
            .order('assignment_order', { ascending: true })
            .limit(1);

        if (firstErr) throw new Error('Failed to query first member: ' + firstErr.message);
        if (!firstMembers || firstMembers.length === 0) return null; // No active members

        return firstMembers[0];
    }

    return nextMembers[0];
}

/**
 * Assigns a grievance (by its UUID) to the next member in round-robin order.
 * Updates the grievances table and the assignment_tracker.
 * Returns the assigned member object.
 */
async function assignGrievance(grievanceUUID) {
    const member = await getNextMember();

    if (!member) {
        console.warn('No active grievance members found. Skipping assignment.');
        return null;
    }

    const assignedAt = new Date().toISOString();

    // Update grievance with assigned member info
    const { error: updateErr } = await supabase
        .from('grievances')
        .update({
            assigned_member_name: member.name,
            assigned_member_email: member.email,
            assigned_at: assignedAt
        })
        .eq('id', grievanceUUID);

    if (updateErr) throw new Error('Failed to assign grievance: ' + updateErr.message);

    // Advance the tracker to this member's order
    const { error: trackerErr } = await supabase
        .from('assignment_tracker')
        .update({ last_assigned_order: member.assignment_order })
        .eq('id', 1);

    if (trackerErr) throw new Error('Failed to update assignment tracker: ' + trackerErr.message);

    console.log(`✅ Grievance ${grievanceUUID} assigned to ${member.name} (${member.email})`);
    return member;
}

module.exports = { assignGrievance, getNextMember };

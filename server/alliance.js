// Alliance system — create, invite, accept, leave, check membership

const alliances = new Map(); // allianceId -> { id, name, leader, members: Set, invites: Set }
let nextAllianceId = 1;

// Reverse lookup: agentId -> allianceId
const agentAlliance = new Map();

function createAlliance(agentId, name) {
  if (agentAlliance.has(agentId)) {
    return { success: false, reason: 'Already in an alliance. Leave first.' };
  }
  if (!name || name.length > 20) {
    return { success: false, reason: 'Alliance name required (max 20 chars)' };
  }

  const id = String(nextAllianceId++);
  const alliance = {
    id,
    name,
    leader: agentId,
    members: new Set([agentId]),
    invites: new Set()
  };
  alliances.set(id, alliance);
  agentAlliance.set(agentId, id);

  return { success: true, allianceId: id, name };
}

function inviteToAlliance(agentId, targetId) {
  const allianceId = agentAlliance.get(agentId);
  if (!allianceId) return { success: false, reason: 'You are not in an alliance' };

  const alliance = alliances.get(allianceId);
  if (alliance.leader !== agentId) {
    return { success: false, reason: 'Only the alliance leader can invite' };
  }

  if (agentAlliance.has(targetId)) {
    return { success: false, reason: 'Target is already in an alliance' };
  }

  alliance.invites.add(targetId);
  return { success: true, invited: targetId, allianceName: alliance.name };
}

function acceptInvite(agentId, allianceId) {
  if (agentAlliance.has(agentId)) {
    return { success: false, reason: 'Already in an alliance. Leave first.' };
  }

  const alliance = alliances.get(allianceId);
  if (!alliance) return { success: false, reason: 'Alliance not found' };

  if (!alliance.invites.has(agentId)) {
    return { success: false, reason: 'No pending invite from this alliance' };
  }

  alliance.invites.delete(agentId);
  alliance.members.add(agentId);
  agentAlliance.set(agentId, allianceId);

  return { success: true, allianceId, allianceName: alliance.name, members: [...alliance.members] };
}

function leaveAlliance(agentId) {
  const allianceId = agentAlliance.get(agentId);
  if (!allianceId) return { success: false, reason: 'Not in an alliance' };

  const alliance = alliances.get(allianceId);
  alliance.members.delete(agentId);
  agentAlliance.delete(agentId);

  // If leader leaves, promote next member or disband
  if (alliance.leader === agentId) {
    if (alliance.members.size > 0) {
      alliance.leader = [...alliance.members][0];
    } else {
      alliances.delete(allianceId);
      return { success: true, disbanded: true };
    }
  }

  return { success: true, disbanded: false };
}

function areAllied(agentId1, agentId2) {
  const a1 = agentAlliance.get(agentId1);
  const a2 = agentAlliance.get(agentId2);
  return a1 != null && a1 === a2;
}

function getAlliance(agentId) {
  const allianceId = agentAlliance.get(agentId);
  if (!allianceId) return null;
  const alliance = alliances.get(allianceId);
  if (!alliance) return null;
  return {
    id: alliance.id,
    name: alliance.name,
    leader: alliance.leader,
    members: [...alliance.members]
  };
}

function getAllianceLeaderboard() {
  return [...alliances.values()].map(a => ({
    id: a.id,
    name: a.name,
    leader: a.leader,
    memberCount: a.members.size,
    members: [...a.members]
  }));
}

// Get all alliance member IDs for shared vision
function getAllianceMembers(agentId) {
  const allianceId = agentAlliance.get(agentId);
  if (!allianceId) return [];
  const alliance = alliances.get(allianceId);
  if (!alliance) return [];
  return [...alliance.members];
}

// Serialization for persistence
function serializeAlliances() {
  const data = [];
  for (const [id, alliance] of alliances) {
    data.push({
      id,
      name: alliance.name,
      leader: alliance.leader,
      members: [...alliance.members],
      invites: [...alliance.invites]
    });
  }
  return { alliances: data, nextId: nextAllianceId };
}

function loadAlliances(data) {
  if (!data) return;
  alliances.clear();
  agentAlliance.clear();

  if (data.nextId) nextAllianceId = data.nextId;

  for (const a of (data.alliances || [])) {
    const alliance = {
      id: a.id,
      name: a.name,
      leader: a.leader,
      members: new Set(a.members),
      invites: new Set(a.invites || [])
    };
    alliances.set(a.id, alliance);
    for (const memberId of a.members) {
      agentAlliance.set(memberId, a.id);
    }
  }
}

export {
  createAlliance, inviteToAlliance, acceptInvite, leaveAlliance,
  areAllied, getAlliance, getAllianceLeaderboard, getAllianceMembers,
  serializeAlliances, loadAlliances
};

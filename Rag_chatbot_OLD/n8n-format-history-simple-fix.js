const parseData = $input.item.json;

// Build vector search filter
let vectorFilter = {};

// Organization filter (skip if admin/developer with null organizationId)
if (parseData.organizationId !== null) {
  vectorFilter['organizationId'] = parseData.organizationId;
}

// Department filter - Match EITHER user's dept OR null (all depts)
if (parseData.departmentId !== null) {
  vectorFilter['departmentId'] = { $in: [parseData.departmentId, null] };
}
// If user has no department (admin/manager), don't filter by department

// File filter (if specific file selected)
if (parseData.fileId) {
  vectorFilter['fileId'] = parseData.fileId;
}

return {
  chatInput: parseData.message,
  userId: parseData.userId,
  organizationId: parseData.organizationId,
  departmentId: parseData.departmentId,
  sessionId: parseData.sessionId,
  vectorFilter: JSON.stringify(vectorFilter)
};

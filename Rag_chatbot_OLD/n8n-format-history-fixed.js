const parseData = $input.item.json;

// Build vector search filter with $or logic for "all departments" support
let vectorFilter = {};

// Organization filter
if (parseData.organizationId !== null) {
  vectorFilter['organizationId'] = parseData.organizationId;
}

// Department filter - FIXED to include "all departments" files
if (parseData.departmentId !== null) {
  // Match either:
  // 1. Files specifically for this department
  // 2. Files marked as "all departments" (departmentId: null AND isAllDepartments: true)
  vectorFilter['$or'] = [
    { departmentId: parseData.departmentId },
    { departmentId: null, isAllDepartments: true }
  ];
} else {
  // If user has no department (admin/manager), don't filter by department
  // This allows seeing all files in the organization
}

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

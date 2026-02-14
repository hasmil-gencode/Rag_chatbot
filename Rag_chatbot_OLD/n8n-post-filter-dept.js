// Post-filter vector results by department
const results = $input.all();
const userDeptId = $('Format History1').item.json.departmentId;

// If user has no department (admin/manager), return all results
if (!userDeptId) {
  return results;
}

// Filter results: keep only files that match user's dept OR have null dept (all depts)
const filtered = results.filter(item => {
  const fileDeptId = item.json.metadata?.departmentId;
  
  // Keep if:
  // 1. File has same departmentId as user, OR
  // 2. File has null departmentId (for all depts)
  return fileDeptId === userDeptId || fileDeptId === null;
});

return filtered;

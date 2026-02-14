// Add these endpoints to server.js after RBAC endpoints

// ============= ORGANIZATIONS =============
app.get('/api/organizations', auth, hasPermission('org:view'), async (req, res) => {
  const orgs = await db.collection('organizations').find().toArray();
  res.json(orgs);
});

app.post('/api/organizations', auth, hasPermission('org:manage'), async (req, res) => {
  const { name, description, status } = req.body;
  
  const result = await db.collection('organizations').insertOne({
    name,
    description,
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/organizations/:id', auth, hasPermission('org:manage'), async (req, res) => {
  const { name, description, status } = req.body;
  
  await db.collection('organizations').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { name, description, status, updatedAt: new Date() } }
  );
  
  res.json({ success: true });
});

app.delete('/api/organizations/:id', auth, hasPermission('org:manage', 'system:delete'), async (req, res) => {
  // Check if any users belong to this org
  const usersCount = await db.collection('users').countDocuments({
    organizationId: new ObjectId(req.params.id)
  });
  
  if (usersCount > 0) {
    return res.status(400).json({ error: 'Cannot delete organization with users' });
  }
  
  // Delete all departments in this org
  await db.collection('departments').deleteMany({
    organizationId: new ObjectId(req.params.id)
  });
  
  await db.collection('organizations').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

// ============= DEPARTMENTS =============
app.get('/api/departments', auth, hasPermission('dept:view'), async (req, res) => {
  const { organizationId } = req.query;
  
  const query = organizationId ? { organizationId: new ObjectId(organizationId) } : {};
  const depts = await db.collection('departments').find(query).toArray();
  
  // Get org names
  const deptsWithOrg = await Promise.all(depts.map(async (dept) => {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(dept.organizationId) });
    return {
      ...dept,
      organizationName: org?.name || 'Unknown'
    };
  }));
  
  res.json(deptsWithOrg);
});

app.post('/api/departments', auth, hasPermission('dept:manage'), async (req, res) => {
  const { name, description, organizationId, status } = req.body;
  
  const result = await db.collection('departments').insertOne({
    name,
    description,
    organizationId: new ObjectId(organizationId),
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/departments/:id', auth, hasPermission('dept:manage'), async (req, res) => {
  const { name, description, organizationId, status } = req.body;
  
  await db.collection('departments').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { 
      name, 
      description, 
      organizationId: new ObjectId(organizationId),
      status, 
      updatedAt: new Date() 
    } }
  );
  
  res.json({ success: true });
});

app.delete('/api/departments/:id', auth, hasPermission('dept:manage', 'system:delete'), async (req, res) => {
  // Check if any users belong to this dept
  const usersCount = await db.collection('users').countDocuments({
    departmentId: new ObjectId(req.params.id)
  });
  
  if (usersCount > 0) {
    return res.status(400).json({ error: 'Cannot delete department with users' });
  }
  
  await db.collection('departments').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

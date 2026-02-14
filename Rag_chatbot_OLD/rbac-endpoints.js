// RBAC Endpoints - Add these to server.js

// ============= PERMISSIONS =============
app.get('/api/permissions', auth, hasPermission('role:manage'), async (req, res) => {
  const permissions = await db.collection('permissions').find().toArray();
  res.json(permissions);
});

// ============= ROLES =============
app.get('/api/roles', auth, hasPermission('role:manage'), async (req, res) => {
  const roles = await db.collection('roles').find().toArray();
  res.json(roles);
});

app.post('/api/roles', auth, hasPermission('role:manage'), async (req, res) => {
  const { name, description, permissions, status } = req.body;
  
  const result = await db.collection('roles').insertOne({
    name,
    description,
    permissions,
    isSystem: false,
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/roles/:id', auth, hasPermission('role:manage'), async (req, res) => {
  const { name, description, permissions, status } = req.body;
  const role = await db.collection('roles').findOne({ _id: new ObjectId(req.params.id) });
  
  if (role.isSystem) {
    return res.status(403).json({ error: 'Cannot edit system roles' });
  }
  
  await db.collection('roles').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { name, description, permissions, status, updatedAt: new Date() } }
  );
  
  res.json({ success: true });
});

app.delete('/api/roles/:id', auth, hasPermission('role:manage', 'system:delete'), async (req, res) => {
  const role = await db.collection('roles').findOne({ _id: new ObjectId(req.params.id) });
  
  if (role.isSystem) {
    return res.status(403).json({ error: 'Cannot delete system roles' });
  }
  
  // Check if any users have this role
  const usersWithRole = await db.collection('users').countDocuments({
    roles: new ObjectId(req.params.id)
  });
  
  if (usersWithRole > 0) {
    return res.status(400).json({ error: 'Cannot delete role assigned to users' });
  }
  
  await db.collection('roles').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

// ============= USERS =============
app.get('/api/users', auth, hasPermission('user:view'), async (req, res) => {
  const users = await db.collection('users').find().toArray();
  
  // Get role names for each user
  const usersWithRoles = await Promise.all(users.map(async (user) => {
    const roles = await db.collection('roles').find({
      _id: { $in: user.roles.map(r => new ObjectId(r)) }
    }).toArray();
    
    return {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles: roles.map(r => ({ id: r._id, name: r.name })),
      createdAt: user.createdAt
    };
  }));
  
  res.json(usersWithRoles);
});

app.post('/api/users', auth, hasPermission('user:manage'), async (req, res) => {
  const { email, password, fullName, roles, status } = req.body;
  
  const existingUser = await db.collection('users').findOne({ email });
  if (existingUser) {
    return res.status(400).json({ error: 'Email already exists' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const result = await db.collection('users').insertOne({
    email,
    password: hashedPassword,
    fullName,
    roles: roles.map(r => new ObjectId(r)),
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/users/:id', auth, hasPermission('user:manage'), async (req, res) => {
  const { email, fullName, roles, status, password } = req.body;
  
  const updateData = {
    email,
    fullName,
    roles: roles.map(r => new ObjectId(r)),
    status,
    updatedAt: new Date()
  };
  
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }
  
  await db.collection('users').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: updateData }
  );
  
  res.json({ success: true });
});

app.delete('/api/users/:id', auth, hasPermission('user:manage', 'system:delete'), async (req, res) => {
  // Prevent deleting yourself
  if (req.params.id === req.user.id.toString()) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

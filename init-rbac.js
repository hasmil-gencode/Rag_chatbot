// Initialize RBAC system with developer account
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot';

const permissions = [
  // System
  { name: 'system:delete', category: 'System', description: 'Delete system data' },
  
  // Role & User Management
  { name: 'role:manage', category: 'Role & User Management', description: 'Create and edit roles' },
  { name: 'user:manage', category: 'Role & User Management', description: 'Create and edit users' },
  { name: 'user:view', category: 'Role & User Management', description: 'View users' },
  
  // Setup Management
  { name: 'setup:manage', category: 'Setup Management', description: 'Manage system settings' },
  { name: 'setup:view', category: 'Setup Management', description: 'View system settings' },
  
  // Chat Management
  { name: 'chat:view', category: 'Chat Management', description: 'View chat sessions' },
  { name: 'chat:manage', category: 'Chat Management', description: 'Manage chat sessions' },
  { name: 'chat:delete', category: 'Chat Management', description: 'Delete chat sessions' },
  
  // File Management
  { name: 'file:view', category: 'File Management', description: 'View files' },
  { name: 'file:upload', category: 'File Management', description: 'Upload files' },
  { name: 'file:delete', category: 'File Management', description: 'Delete files' },
  { name: 'file:manage_access', category: 'File Management', description: 'Manage file access control' },
  
  // Organization & Department Management
  { name: 'org:manage', category: 'Organization Management', description: 'Manage organizations' },
  { name: 'org:view', category: 'Organization Management', description: 'View organizations' },
  { name: 'dept:manage', category: 'Department Management', description: 'Manage departments' },
  { name: 'dept:view', category: 'Department Management', description: 'View departments' },
];

const roles = [
  {
    name: 'Developer',
    description: 'Full system access - can do everything',
    permissions: permissions.map(p => p.name),
    isSystem: true,
    status: 'active'
  },
  {
    name: 'Admin',
    description: 'Organization admin - manage users, departments, and files within organization',
    permissions: [
      'user:manage', 'user:view',
      'chat:view', 'chat:delete',
      'file:view', 'file:upload', 'file:delete', 'file:manage_access',
      'dept:manage', 'dept:view'
    ],
    isSystem: false,
    status: 'active'
  },
  {
    name: 'Manager',
    description: 'Department manager - manage users and files within department',
    permissions: [
      'user:manage', 'user:view',
      'chat:view', 'chat:delete',
      'file:view', 'file:upload', 'file:delete'
    ],
    isSystem: false,
    status: 'active'
  },
  {
    name: 'User',
    description: 'Basic user - chat and view files within department',
    permissions: [
      'chat:view',
      'chat:delete',
      'file:view'
    ],
    isSystem: false,
    status: 'active'
  }
];

async function initializeRBAC() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('ragchatbot');
    
    console.log('🔧 Initializing RBAC system...');
    
    // 1. Insert permissions
    await db.collection('permissions').deleteMany({});
    await db.collection('permissions').insertMany(permissions);
    console.log(`✅ Created ${permissions.length} permissions`);
    
    // 2. Insert roles
    await db.collection('roles').deleteMany({});
    const rolesResult = await db.collection('roles').insertMany(roles);
    console.log(`✅ Created ${roles.length} roles`);
    
    // 3. Create developer user
    const developerRole = await db.collection('roles').findOne({ name: 'Developer' });
    const hashedPassword = await bcrypt.hash('Developer@123', 10);
    
    await db.collection('users').deleteMany({});
    await db.collection('users').insertOne({
      email: 'developer@gencode.com.my',
      password: hashedPassword,
      fullName: 'Super Administrator',
      roles: [developerRole._id],
      organizationId: null, // Developer has access to all
      departmentId: null,
      status: 'active',
      createdAt: new Date()
    });
    
    console.log('✅ Created developer account:');
    console.log('   Email: developer@gencode.com.my');
    console.log('   Password: Developer@123');
    
    // 4. Create sample organization and department
    await db.collection('organizations').deleteMany({});
    await db.collection('departments').deleteMany({});
    
    const sampleOrg = await db.collection('organizations').insertOne({
      name: 'GenCode',
      description: 'Main Organization',
      status: 'active',
      createdAt: new Date()
    });
    
    await db.collection('departments').insertOne({
      name: 'IT Department',
      description: 'Information Technology',
      organizationId: sampleOrg.insertedId,
      status: 'active',
      createdAt: new Date()
    });
    
    console.log('✅ Created sample organization and department');
    console.log('');
    console.log('🎉 RBAC system initialized successfully!');
    
  } catch (error) {
    console.error('❌ Error initializing RBAC:', error);
  } finally {
    await client.close();
  }
}

initializeRBAC();

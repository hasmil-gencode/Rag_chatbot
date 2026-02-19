// API Integration for GenBotChat
// Connects React frontend to Express backend

const API_BASE = '/api'

interface LoginData {
  email: string
  password: string
}

interface ChatMessage {
  role: 'user' | 'bot'
  content: string
}

interface ChatSession {
  id: string
  title: string
  lastMessageAt: string
  messageCount: number
}

export interface FileItem {
  id: string
  name: string
  uploadedAt: string
  uploadedBy?: string
  organizationName?: string
  isAllOrganizations?: boolean
}

export interface Message {
  _id: string
  content: string
  role: 'user' | 'bot'
  createdAt: string
  startedBy?: string
  startedByEmail?: string
}

interface Settings {
  companyName?: string
  voiceMode?: string
  voiceLanguage?: string
  detectVoiceDuringTTS?: boolean
  ttsMode?: string
  ttsLanguage?: string
  geminiApiKey?: string
  elevenlabsApiKey?: string
  gclasApiKey?: string
  chatWebhook?: string
  uploadWebhook?: string
  transcribeWebhook?: string
  s3Bucket?: string
  s3Region?: string
  s3AccessKey?: string
  s3SecretKey?: string
  logo?: string
}

class API {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('token')
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    }
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token')
    return {
      ...(token && { 'Authorization': `Bearer ${token}` }),
    }
  }

  async login(data: LoginData) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Login failed')
    return json
  }

  async changePasswordFirstLogin(tempToken: string, newPassword: string) {
    const res = await fetch(`${API_BASE}/change-password-first-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, newPassword }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to change password')
    return json
  }

  async register(data: LoginData) {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Registration failed')
    return json
  }

  async sendMessage(message: string, sessionId?: string, fileId?: string, currentOrganizationId?: string | null): Promise<{ response: string; sessionId: string }> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message, sessionId, fileId, currentOrganizationId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to send message')
    return json
  }

  async getMessages(sessionId?: string): Promise<ChatMessage[]> {
    const url = sessionId ? `${API_BASE}/messages?sessionId=${sessionId}` : `${API_BASE}/messages`
    const res = await fetch(url, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load messages')
    return res.json()
  }

  async getSessions(currentOrganizationId?: string | null): Promise<ChatSession[]> {
    const url = currentOrganizationId 
      ? `${API_BASE}/sessions?currentOrganizationId=${currentOrganizationId}`
      : `${API_BASE}/sessions`;
    const res = await fetch(url, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load sessions')
    return res.json()
  }

  async deleteSession(sessionId: string) {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete session')
    return res.json()
  }

  async uploadFile(file: File, sharedWith: string[]): Promise<{ success: boolean; fileId: string; message: string; chunks: number }> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sharedWith', JSON.stringify(sharedWith))
    
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json
  }

  async getFiles(currentOrganizationId?: string | null): Promise<FileItem[]> {
    const url = currentOrganizationId
      ? `${API_BASE}/files?organizationId=${currentOrganizationId}`
      : `${API_BASE}/files`;
    const res = await fetch(url, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load files')
    return res.json()
  }

  async deleteFile(fileId: string) {
    const res = await fetch(`${API_BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete file')
    return res.json()
  }

  async getSettings(): Promise<Settings> {
    const res = await fetch(`${API_BASE}/settings`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load settings')
    return res.json()
  }

  async updateSettings(settings: Settings) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })
    if (!res.ok) throw new Error('Failed to update settings')
    return res.json()
  }

  async uploadLogo(file: File): Promise<{ success: boolean; logo: string }> {
    const formData = new FormData()
    formData.append('logo', file)

    const res = await fetch(`${API_BASE}/upload-logo`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Logo upload failed')
    return json
  }

  // Forms Management
  async getForms() {
    const res = await fetch(`${API_BASE}/forms`, {
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to get forms')
    return json
  }

  async uploadForm(file: File, sharedWith: string[]) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'form')
    formData.append('sharedWith', JSON.stringify(sharedWith))
    
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json
  }

  // ============= RBAC =============
  async getPermissions() {
    const res = await fetch(`${API_BASE}/permissions`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load permissions')
    return res.json()
  }

  async getRoles() {
    const res = await fetch(`${API_BASE}/roles`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load roles')
    return res.json()
  }

  async createRole(data: { name: string; description: string; permissions: string[]; status: string }) {
    const res = await fetch(`${API_BASE}/roles`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create role')
    return json
  }

  async updateRole(id: string, data: { name: string; description: string; permissions: string[]; status: string }) {
    const res = await fetch(`${API_BASE}/roles/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update role')
    return json
  }

  async deleteRole(id: string) {
    const res = await fetch(`${API_BASE}/roles/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete role')
    return json
  }

  // ===== Phase 5: Multi-Org APIs =====
  
  async getUserInfo() {
    const res = await fetch(`${API_BASE}/user/me`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load user info')
    return res.json()
  }
  
  async getUsers() {
    const res = await fetch(`${API_BASE}/users`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load users')
    return res.json()
  }

  async deleteUser(userId: string) {
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete user')
    return json
  }

  async resetUserPassword(userId: string, defaultPassword: string) {
    const res = await fetch(`${API_BASE}/users/${userId}/reset-password`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ defaultPassword }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to reset password')
    return json
  }

  async updateUser(userId: string, fullName: string, password?: string, canUploadFiles?: boolean) {
    const body: any = { fullName };
    if (password) body.password = password;
    if (canUploadFiles !== undefined) body.canUploadFiles = canUploadFiles;
    
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update user')
    return json
  }

  async getUserAssignments(userId: string) {
    const res = await fetch(`${API_BASE}/user-assignments/${userId}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load user assignments')
    return res.json()
  }

  async getAllOrganizations() {
    const res = await fetch(`${API_BASE}/organizations`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load organizations')
    return res.json()
  }

  async deleteOrganization(orgId: string) {
    const res = await fetch(`${API_BASE}/organizations/${orgId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete organization')
    return json
  }

  async updateOrganization(orgId: string, name: string, type: string, parentId: string | null) {
    const res = await fetch(`${API_BASE}/organizations/${orgId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, type, parentId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update organization')
    return json
  }
  
  async testWebhook(url: string) {
    const res = await fetch(`${API_BASE}/test-webhook`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ url }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error || 'Webhook test failed')
    return json
  }

  async testS3(settings: any) {
    const res = await fetch(`${API_BASE}/test-s3`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error || 'S3 test failed')
    return json
  }

  // API Key Management
  async getApiKeys() {
    const res = await fetch(`${API_BASE}/keys`, {
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to get API keys')
    return json
  }

  async createApiKey(name: string, userId: string) {
    const res = await fetch(`${API_BASE}/keys`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, userId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create API key')
    return json
  }

  async toggleApiKey(id: string, isActive: boolean) {
    const res = await fetch(`${API_BASE}/keys/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ isActive }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to toggle API key')
    return json
  }

  async deleteApiKey(id: string) {
    const res = await fetch(`${API_BASE}/keys/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete API key')
    return json
  }

  async getApiUsage() {
    const res = await fetch(`${API_BASE}/usage`, {
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to get API usage')
    return json
  }

  // Group Management
  async getGroups() {
    const res = await fetch(`${API_BASE}/groups`, {
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to get groups')
    return json
  }

  async createGroup(data: { name: string; storageLimitGB: number; chatQuota: number; quotaType: string; renewDay: number; organizationIds: string[] }) {
    const res = await fetch(`${API_BASE}/groups`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create group')
    return json
  }

  async updateGroup(id: string, data: { name: string; storageLimitGB: number; chatQuota: number; quotaType: string; renewDay: number; organizationIds: string[] }) {
    const res = await fetch(`${API_BASE}/groups/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update group')
    return json
  }

  async getChatUsage() {
    const res = await fetch(`${API_BASE}/chat-usage`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to get chat usage')
    return res.json()
  }

  async updateUserName(fullName: string) {
    const res = await fetch(`${API_BASE}/user/name`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ fullName }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update name')
    return json
  }

  async deleteGroup(id: string) {
    const res = await fetch(`${API_BASE}/groups/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete group')
    return json
  }

  async resetGroupQuota(id: string) {
    const res = await fetch(`${API_BASE}/groups/${id}/reset-quota`, {
      method: 'POST',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to reset quota')
    return json
  }

  async addGroupBonus(id: string, bonusQuota: number) {
    const res = await fetch(`${API_BASE}/groups/${id}/add-bonus`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ bonusQuota }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to add bonus')
    return json
  }

  async updateGroupRenewDay(id: string, renewDay: number) {
    const res = await fetch(`${API_BASE}/groups/${id}/renew-day`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ renewDay }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update renew day')
    return json
  }

  // ===== Phase 5: Multi-Org APIs =====
  
  async getStorageInfo() {
    const res = await fetch(`${API_BASE}/storage-info`, {
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to get storage info')
    return json
  }

  async getMyOrganizations() {
    const res = await fetch(`${API_BASE}/my-organizations`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load organizations')
    return res.json()
  }

  async getMyOrganizationsHierarchy() {
    const res = await fetch(`${API_BASE}/my-organizations-hierarchy`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load organizations hierarchy')
    return res.json()
  }

  async switchOrganization(organizationId: string) {
    const res = await fetch(`${API_BASE}/switch-organization`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ organizationId }),
    })
    if (!res.ok) throw new Error('Failed to switch organization')
    return res.json()
  }

  async createUser(email: string, password: string, fullName: string, canUploadFiles: boolean = true) {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password, fullName, canUploadFiles }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create user')
    return json
  }

  async createOrganization(name: string, type: string, parentId: string | null) {
    const res = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, type, parentId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create organization')
    return json
  }

  async assignUserToOrganizations(userId: string, organizationIds: string[]) {
    const res = await fetch(`${API_BASE}/user-assignments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ userId, organizationIds }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to assign user')
    return json
  }
}

export const api = new API()
export type { ChatMessage, ChatSession, Settings }

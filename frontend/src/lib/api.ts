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

  async sendMessage(message: string, sessionId?: string, fileId?: string): Promise<{ response: string; sessionId: string }> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message, sessionId, fileId }),
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

  async getSessions(): Promise<ChatSession[]> {
    const res = await fetch(`${API_BASE}/sessions`, {
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

  async uploadFile(file: File): Promise<{ success: boolean; fileId: string; message: string; chunks: number }> {
    const formData = new FormData()
    formData.append('file', file)
    
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Upload failed')
    return json
  }

  async getFiles(): Promise<FileItem[]> {
    const res = await fetch(`${API_BASE}/files`, {
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

  async getUsers() {
    const res = await fetch(`${API_BASE}/users`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load users')
    return res.json()
  }

  async createUser(data: { email: string; password: string; fullName: string; roles: string[]; status: string }) {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create user')
    return json
  }

  async updateUser(id: string, data: { email: string; fullName: string; roles: string[]; status: string; password?: string }) {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update user')
    return json
  }

  async deleteUser(id: string) {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete user')
    return json
  }

  // ============= ORGANIZATIONS =============
  async getOrganizations() {
    const res = await fetch(`${API_BASE}/organizations`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load organizations')
    return res.json()
  }

  async createOrganization(data: { name: string; description: string; status: string }) {
    const res = await fetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create organization')
    return json
  }

  async updateOrganization(id: string, data: { name: string; description: string; status: string }) {
    const res = await fetch(`${API_BASE}/organizations/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update organization')
    return json
  }

  async deleteOrganization(id: string) {
    const res = await fetch(`${API_BASE}/organizations/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete organization')
    return json
  }

  // ============= DEPARTMENTS =============
  async getDepartments(organizationId?: string) {
    const url = organizationId 
      ? `${API_BASE}/departments?organizationId=${organizationId}`
      : `${API_BASE}/departments`
    const res = await fetch(url, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error('Failed to load departments')
    return res.json()
  }

  async createDepartment(data: { name: string; description: string; organizationId: string; status: string }) {
    const res = await fetch(`${API_BASE}/departments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to create department')
    return json
  }

  async updateDepartment(id: string, data: { name: string; description: string; organizationId: string; status: string }) {
    const res = await fetch(`${API_BASE}/departments/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to update department')
    return json
  }

  async deleteDepartment(id: string) {
    const res = await fetch(`${API_BASE}/departments/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to delete department')
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
}

export const api = new API()
export type { ChatMessage, ChatSession, Settings }

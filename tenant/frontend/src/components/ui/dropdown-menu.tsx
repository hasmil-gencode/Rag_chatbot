// Simplified dropdown menu - remove if not needed
export const DropdownMenu = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const DropdownMenuTrigger = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const DropdownMenuContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
export const DropdownMenuItem = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <button onClick={onClick}>{children}</button>
)

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserNote {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: 'General' | 'Work' | 'Personal' | 'Ideas' | 'Urgent';
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

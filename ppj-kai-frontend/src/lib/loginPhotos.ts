import api from './api';

export interface LoginPhoto {
  id: number;
  title: string;
  url: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export function loginPhotoUrl(photo: LoginPhoto): string {
  return `${(api.defaults.baseURL || '/api').replace(/\/$/, '')}${photo.url}`;
}

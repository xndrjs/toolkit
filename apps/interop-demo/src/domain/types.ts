export interface UserRow {
  type: "User";
  email: string;
  displayName: string;
  isVerified: boolean;
}

export interface ProfileRow {
  type: "Profile";
  email: string;
  displayName: string;
  isVerified: boolean;
  nickname: string;
}

export interface UserContactRow {
  email: string;
  displayName: string;
}

export interface PlayerInterface {
  id: string;
  name: string;
  canVote: boolean;
  choice: string | boolean;
  previousChoiceBeforeAdminChange?: string | boolean;
  role?: PlayerRoles;
}

export enum PlayerRoles {
  ADMIN = 'ADMIN',
  COMMON = 'COMMON',
}

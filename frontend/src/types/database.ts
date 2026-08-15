export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContributionStatus = "pending" | "approved" | "rejected" | "refunded";
export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid" | "cancelled";
export type MemberRole = "admin" | "member";
export type CurrencyCode = "ARS" | "CLP" | "USD" | "BRL" | "MXN";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Alcanzia {
  id: string;
  title: string;
  description: string | null;
  goal_amount: number;
  currency: CurrencyCode;
  creator_id: string;
  is_active: boolean;
  invite_token: string;
  withdrawal_responsible_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlcanziaMember {
  id: string;
  alcanzia_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profiles?: Profile;
}

export interface Contribution {
  id: string;
  alcanzia_id: string;
  user_id: string;
  amount: number;
  currency: CurrencyCode;
  status: ContributionStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  external_reference: string | null;
  payment_date: string | null;
  mp_fee: number | null;
  net_amount: number | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface Withdrawal {
  id: string;
  alcanzia_id: string;
  amount: number;
  currency: CurrencyCode;
  description: string | null;
  status: WithdrawalStatus;
  requested_by: string;
  approved_by: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface Movimiento {
  id: string;
  alcanzia_id: string;
  user_id: string;
  monto: number;
  monto_neto: number | null;
  currency: CurrencyCode;
  tipo: "aporte" | "retiro";
  estado: string;
  fecha: string | null;
  created_at: string;
  usuario_nombre: string | null;
  usuario_avatar: string | null;
  usuario_telefono: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      alcanzias: {
        Row: Alcanzia;
        Insert: Omit<Alcanzia, "id" | "invite_token" | "created_at" | "updated_at"> & {
          id?: string;
          invite_token?: string;
        };
        Update: Partial<Alcanzia>;
      };
      alcanzia_members: {
        Row: AlcanziaMember;
        Insert: Omit<AlcanziaMember, "id" | "joined_at"> & { id?: string };
        Update: Partial<AlcanziaMember>;
      };
      contributions: {
        Row: Contribution;
        Insert: Omit<Contribution, "id" | "created_at" | "updated_at" | "status"> & {
          id?: string;
          status?: ContributionStatus;
        };
        Update: Partial<Contribution>;
      };
      withdrawals: {
        Row: Withdrawal;
        Insert: Omit<Withdrawal, "id" | "created_at" | "updated_at" | "status" | "approved_by" | "paid_at"> & {
          id?: string;
          status?: WithdrawalStatus;
        };
        Update: Partial<Withdrawal>;
      };
    };
    Views: {
      movimientos_alcanzia: {
        Row: Movimiento;
      };
    };
    Functions: {
      get_alcanzia_balance: {
        Args: { p_alcanzia_id: string };
        Returns: number;
      };
      join_alcanzia_by_token: {
        Args: { p_token: string };
        Returns: string;
      };
      get_superadmin_users: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; full_name: string | null; email: string | null; phone: string | null; created_at: string }[];
      };
      get_superadmin_alcanzias: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; title: string; goal_amount: number; currency: string; is_active: boolean; balance: number; last_movement_date: string | null }[];
      };
      toggle_alcanzia_active: {
        Args: { p_alcanzia_id: string; p_is_active: boolean };
        Returns: void;
      };
    };
  };
}

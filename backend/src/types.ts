/**
 * 環境変数の型定義
 */
export interface EnvironmentVariables {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_SHEET_NAME?: string;
  OPTIONS_SHEET_NAME?: string;
  CORS_ORIGIN?: string;
  AUTH_PASSWORD?: string;
}

/**
 * 選択肢マスタのデータ構造
 */
export interface FormOptionsData {
  desiredGrade: string[];
  subcommittee1: string[];
  subcommittee2: string[];
  raw?: Record<string, string[]>;
}

/**
 * 公開設定情報（設定マスタから取得、機密情報は除外）
 */
export interface PublicSettingsData {
  conferenceName: string;
  [key: string]: string;
}

/**
 * 参加者データのインターフェース（スプレッドシート24列に対応）
 */
export interface Participant {
  id: string; // [1] A: システムID (UUID)
  organization: string; // [2] B: 法人・団体名
  lastName: string; // [3] C: 姓
  firstName: string; // [4] D: 名
  lastNameKana: string; // [5] E: 姓（フリガナ） ※検索キー
  firstNameKana: string; // [6] F: 名（フリガナ） ※検索キー
  phone1: string; // [7] G: 電話番号（上3ケタ）
  phone2: string; // [8] H: 電話番号（中4ケタ）
  phone3: string; // [9] I: 電話番号（下4ケタ）
  email: string; // [10] J: メールアドレス
  position: string; // [11] K: 役職名
  transportation: string; // [12] L: 交通手段
  desiredGrade: string; // [13] M: 授業公開希望学年
  subcommittee1: string; // [14] N: 分科会（第1希望）
  subcommittee2: string; // [15] O: 分科会（第2希望）
  notes: string; // [16] P: 連絡・要望
  location: string; // [17] Q: 所属所在地
  checkedIn: boolean; // [18] R: 受付状況 (TRUE/FALSE)
  bentoOrdered: boolean; // [19] S: 弁当注文 (TRUE/FALSE: 事前注文有無)
  feePaid: boolean; // [20] T: 参加費事前支払 (TRUE/FALSE: 変更不可)
  isWalkin: boolean; // [21] U: 当日受付 (TRUE/FALSE)
  updatedAt: string; // [22] V: 最終更新日時
  bentoConfirmed: boolean; // [23] W: 弁当券引換確認 (TRUE/FALSE)
  bentoExchanged: boolean; // 互換用エイリアス
  feeConfirmed: boolean; // [24] X: 参加費支払確認 (TRUE/FALSE: 当日受領フラグ)
  rowIndex?: number; // スプレッドシート上の行番号（2行目以降、1-indexed）
}

/**
 * 受付ステータス更新リクエスト
 */
export interface UpdateStatusRequest {
  id: string; // 対象のシステムID
  checkedIn?: boolean; // 受付状況 (R列)
  bentoConfirmed?: boolean; // 弁当券引換確認 (W列)
  bentoExchanged?: boolean; // 弁当券引換確認（互換用）
  feeConfirmed?: boolean; // 参加費支払確認 (X列: 当日受領フラグ)
  rowIndex?: number; // 行番号（指定があれば検索をスキップ可能）
}

/**
 * 当日参加者新規登録リクエスト
 */
export interface WalkinRegistrationRequest {
  organization: string; // 法人・団体名
  lastName: string; // 姓
  firstName: string; // 名
  lastNameKana: string; // 姓（フリガナ）
  firstNameKana: string; // 名（フリガナ）
  phone1?: string; // 電話番号（上3ケタ）
  phone2?: string; // 電話番号（中4ケタ）
  phone3?: string; // 電話番号（下4ケタ）
  email?: string; // メールアドレス
  position?: string; // 役職名
  transportation?: string; // 交通手段
  desiredGrade?: string; // 授業公開希望学年
  subcommittee1?: string; // 分科会（第1希望）
  subcommittee2?: string; // 分科会（第2希望）
  notes?: string; // 連絡・要望
  location?: string; // 所属所在地
  checkedIn?: boolean; // 受付状況（指定なし時はtrue）
  bentoOrdered?: boolean; // 弁当注文（当日受付時はデフォルトfalse）
  bentoConfirmed?: boolean; // 弁当引換確認（指定なし時はfalse）
  feePaid?: boolean; // 参加費事前支払（当日登録はfalse）
  feeConfirmed?: boolean; // 参加費支払確認（指定なし時はfalse）
}

/**
 * 共通APIレスポンス
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
  error?: string;
}

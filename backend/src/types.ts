/**
 * 環境変数の型定義
 */
export interface EnvironmentVariables {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_SHEET_NAME?: string;
  CORS_ORIGIN?: string;
  AUTH_PASSWORD?: string;
}

/**
 * 参加者データのインターフェース（スプレッドシート22列に対応）
 */
export interface Participant {
  id: string; // [1] システムID (UUID)
  organization: string; // [2] 法人・団体名
  lastName: string; // [3] 姓
  firstName: string; // [4] 名
  lastNameKana: string; // [5] 姓（フリガナ） ※検索キー
  firstNameKana: string; // [6] 名（フリガナ） ※検索キー
  phone1: string; // [7] 電話番号（上3ケタ）
  phone2: string; // [8] 電話番号（中4ケタ）
  phone3: string; // [9] 電話番号（下4ケタ）
  email: string; // [10] メールアドレス
  position: string; // [11] 役職名
  transportation: string; // [12] 交通手段
  desiredGrade: string; // [13] 授業公開希望学年
  subcommittee1: string; // [14] 分科会（第1希望）
  subcommittee2: string; // [15] 分科会（第2希望）
  notes: string; // [16] 連絡・要望
  location: string; // [17] 所属所在地
  checkedIn: boolean; // [18] 受付状況 (TRUE/FALSE)
  bentoExchanged: boolean; // [19] 弁当引換 (TRUE/FALSE)
  feePaid: boolean; // [20] 参加費支払 (TRUE/FALSE)
  isWalkin: boolean; // [21] 当日受付 (TRUE/FALSE)
  updatedAt: string; // [22] 最終更新日時
  rowIndex?: number; // スプレッドシート上の行番号（2行目以降、1-indexed）
}

/**
 * 受付ステータス更新リクエスト
 */
export interface UpdateStatusRequest {
  id: string; // 対象のシステムID
  checkedIn?: boolean; // 受付状況
  bentoExchanged?: boolean; // 弁当引換
  feePaid?: boolean; // 参加費支払
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
  bentoExchanged?: boolean; // 弁当引換（指定なし時はfalse）
  feePaid?: boolean; // 参加費支払（指定なし時はfalse）
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

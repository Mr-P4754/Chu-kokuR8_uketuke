/**
 * 受付用UI (index.html) メインアプリケーションスクリプト (app.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 状態管理ステート
  const state = {
    participants: [], // 全参加者データ
    filteredList: [], // 検索・フィルター適用後データ
    currentTab: 'search', // 'search' | 'list'
    currentFilter: 'all', // 'all' | 'unregistered' | 'registered' | 'walkin' | 'bento_pending' | 'fee_pending'
    searchQuery: '', // 検索文字列
    selectedParticipant: null, // モーダルで選択中の参加者
    isAuthenticated: false, // 簡易認証フラグ
    authPassword: 'reception2026', // デフォルト簡易認証パスワード
    isFetching: false, // データ取得中フラグ
  };

  // DOM要素の取得
  const elements = {
    // 認証関連
    authModal: document.getElementById('authModal'),
    authPasswordInput: document.getElementById('authPasswordInput'),
    authSubmitButton: document.getElementById('authSubmitButton'),
    authErrorText: document.getElementById('authErrorText'),

    // ヘッダー & 同期
    syncButton: document.getElementById('syncButton'),
    syncSpinner: document.getElementById('syncSpinner'),
    lastSyncText: document.getElementById('lastSyncText'),
    offlineBanner: document.getElementById('offlineBanner'),
    queueCountBadge: document.getElementById('queueCountBadge'),
    onlineStatusDot: document.getElementById('onlineStatusDot'),
    onlineStatusText: document.getElementById('onlineStatusText'),

    // 統計カウンター
    statTotal: document.getElementById('statTotal'),
    statCheckedIn: document.getElementById('statCheckedIn'),
    statCheckedInPercent: document.getElementById('statCheckedInPercent'),
    statBento: document.getElementById('statBento'),
    statFee: document.getElementById('statFee'),
    statWalkin: document.getElementById('statWalkin'),

    // タブ
    tabSearch: document.getElementById('tabSearch'),
    tabList: document.getElementById('tabList'),
    searchSection: document.getElementById('searchSection'),
    listSection: document.getElementById('listSection'),

    // 検索・一覧コントロール
    searchInput: document.getElementById('searchInput'),
    clearSearchButton: document.getElementById('clearSearchButton'),
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    searchResultCount: document.getElementById('searchResultCount'),
    
    // 一覧フィルター & リスト
    filterButtons: document.querySelectorAll('.filter-btn'),
    listResultsContainer: document.getElementById('listResultsContainer'),
    listResultCount: document.getElementById('listResultCount'),

    // 詳細モーダル
    detailModal: document.getElementById('detailModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalContent: document.getElementById('modalContent'),
    modalCloseButton: document.getElementById('modalCloseButton'),
    modalName: document.getElementById('modalName'),
    modalKana: document.getElementById('modalKana'),
    modalOrg: document.getElementById('modalOrg'),
    modalPosition: document.getElementById('modalPosition'),
    modalId: document.getElementById('modalId'),
    modalPhone: document.getElementById('modalPhone'),
    modalEmail: document.getElementById('modalEmail'),
    modalLocation: document.getElementById('modalLocation'),
    modalTransport: document.getElementById('modalTransport'),
    modalGrade: document.getElementById('modalGrade'),
    modalSub1: document.getElementById('modalSub1'),
    modalSub2: document.getElementById('modalSub2'),
    modalNotes: document.getElementById('modalNotes'),
    modalWalkinBadge: document.getElementById('modalWalkinBadge'),
    modalUpdatedAt: document.getElementById('modalUpdatedAt'),

    // モーダル内ステータストグルボタン
    toggleCheckinBtn: document.getElementById('toggleCheckinBtn'),
    toggleBentoBtn: document.getElementById('toggleBentoBtn'),
    toggleFeeBtn: document.getElementById('toggleFeeBtn'),
  };

  /**
   * ひらがな→カタカナ変換
   */
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0x60)
    );
  }

  /**
   * カタカナ→ひらがな変換
   */
  function toHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    );
  }

  /**
   * 全角半角正規化（英数・スペース）
   */
  function normalizeString(str) {
    if (!str) return '';
    return str
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0xfee0)
      )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * 簡易認証の検証
   */
  function checkAuthentication() {
    const storedAuth = sessionStorage.getItem(window.AppConfig?.authStorageKey || 'reception_auth_token');
    if (storedAuth === 'authorized') {
      state.isAuthenticated = true;
      elements.authModal?.classList.add('hidden');
      loadInitialData();
    } else {
      state.isAuthenticated = false;
      elements.authModal?.classList.remove('hidden');
      setTimeout(() => elements.authPasswordInput?.focus(), 100);
    }
  }

  // 認証ボタンクリック
  elements.authSubmitButton?.addEventListener('click', handleAuthSubmit);
  elements.authPasswordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuthSubmit();
  });

  function handleAuthSubmit() {
    const inputPass = elements.authPasswordInput.value.trim();
    if (inputPass === state.authPassword) {
      sessionStorage.setItem(window.AppConfig?.authStorageKey || 'reception_auth_token', 'authorized');
      state.isAuthenticated = true;
      elements.authModal?.classList.add('hidden');
      elements.authErrorText?.classList.add('hidden');
      loadInitialData();
    } else {
      elements.authErrorText?.classList.remove('hidden');
      elements.authPasswordInput?.focus();
    }
  }

  /**
   * 初期データの読み込み（キャッシュ優先表示後、APIフェッチ）
   */
  async function loadInitialData() {
    // 1. ローカルキャッシュの即時読み込み表示
    const cached = window.queueManager?.getCachedParticipants();
    if (cached && Array.isArray(cached) && cached.length > 0) {
      state.participants = cached;
      updateStatistics();
      renderCurrentView();
    }

    // 2. バックエンドAPIから最新データをフェッチ
    await fetchParticipantsFromApi();

    // 3. 未送信オフラインキューがあれば同期試行
    if (window.queueManager) {
      await window.queueManager.processQueue();
    }
  }

  /**
   * 参加者一覧をAPIからフェッチ
   */
  async function fetchParticipantsFromApi() {
    if (state.isFetching) return;
    state.isFetching = true;
    updateSyncButtonState(true);

    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    try {
      const response = await fetch(`${baseUrl}/api/participants`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`サーバーレスポンスエラー: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        state.participants = result.data;
        // キャッシュに保存
        window.queueManager?.setCachedParticipants(state.participants);
        updateStatistics();
        renderCurrentView();
        updateLastSyncDisplay();
      }
    } catch (error) {
      console.warn('[Fetch Warning] 最新データの取得に失敗しました（キャッシュデータを使用します）:', error);
    } finally {
      state.isFetching = false;
      updateSyncButtonState(false);
    }
  }

  /**
   * 同期ボタン状態更新
   */
  function updateSyncButtonState(isSyncing) {
    if (!elements.syncButton) return;
    if (isSyncing) {
      elements.syncSpinner?.classList.remove('hidden');
      elements.syncButton.disabled = true;
    } else {
      elements.syncSpinner?.classList.add('hidden');
      elements.syncButton.disabled = false;
    }
  }

  /**
   * 最終同期日時の表示更新
   */
  function updateLastSyncDisplay() {
    if (!elements.lastSyncText) return;
    const lastSync = window.queueManager?.getLastSyncTime();
    if (lastSync) {
      const date = new Date(lastSync);
      const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      elements.lastSyncText.textContent = `最終同期: ${timeStr}`;
    } else {
      elements.lastSyncText.textContent = '未同期';
    }
  }

  /**
   * 統計バーの計算と更新
   */
  function updateStatistics() {
    const total = state.participants.length;
    const checkedIn = state.participants.filter((p) => p.checkedIn).length;
    // 弁当事前注文者数と引換済数
    const bentoOrderedTotal = state.participants.filter((p) => p.bentoOrdered).length;
    const bentoConfirmed = state.participants.filter((p) => p.bentoOrdered && (p.bentoConfirmed || p.bentoExchanged)).length;
    const fee = state.participants.filter((p) => p.feePaid).length;
    const walkin = state.participants.filter((p) => p.isWalkin).length;

    const percent = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

    if (elements.statTotal) elements.statTotal.textContent = total;
    if (elements.statCheckedIn) elements.statCheckedIn.textContent = checkedIn;
    if (elements.statCheckedInPercent) elements.statCheckedInPercent.textContent = `(${percent}%)`;
    if (elements.statBento) elements.statBento.textContent = `${bentoConfirmed} / ${bentoOrderedTotal}`;
    if (elements.statFee) elements.statFee.textContent = fee;
    if (elements.statWalkin) elements.statWalkin.textContent = walkin;
  }

  /**
   * キューおよびオンライン状態の更新リスナー
   */
  if (window.queueManager) {
    window.queueManager.subscribe(({ isOnline, queueCount, isSyncing }) => {
      // オンライン状態ドット
      if (elements.onlineStatusDot) {
        elements.onlineStatusDot.className = `w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`;
      }
      if (elements.onlineStatusText) {
        elements.onlineStatusText.textContent = isOnline ? 'オンライン' : 'オフライン';
      }

      // オフラインバナー & キューバッジ
      if (!isOnline || queueCount > 0) {
        elements.offlineBanner?.classList.remove('hidden');
        if (elements.queueCountBadge) elements.queueCountBadge.textContent = queueCount;
      } else {
        elements.offlineBanner?.classList.add('hidden');
      }

      if (isSyncing) {
        updateSyncButtonState(true);
      } else if (!state.isFetching) {
        updateSyncButtonState(false);
      }
    });
  }

  /**
   * タブ切り替え処理
   */
  elements.tabSearch?.addEventListener('click', () => switchTab('search'));
  elements.tabList?.addEventListener('click', () => switchTab('list'));

  function switchTab(tab) {
    state.currentTab = tab;
    if (tab === 'search') {
      elements.tabSearch.className = 'touch-target py-3 px-6 text-sm sm:text-base font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
      elements.tabList.className = 'touch-target py-3 px-6 text-sm sm:text-base font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center space-x-2';
      elements.searchSection?.classList.remove('hidden');
      elements.listSection?.classList.add('hidden');
      setTimeout(() => elements.searchInput?.focus(), 50);
    } else {
      elements.tabSearch.className = 'touch-target py-3 px-6 text-sm sm:text-base font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center space-x-2';
      elements.tabList.className = 'touch-target py-3 px-6 text-sm sm:text-base font-bold border-b-2 border-indigo-600 text-indigo-600 flex items-center space-x-2';
      elements.searchSection?.classList.add('hidden');
      elements.listSection?.classList.remove('hidden');
    }
    renderCurrentView();
  }

  /**
   * 検索ロジック（フリガナ・漢字・所属など）
   */
  function filterParticipantsBySearch(query) {
    if (!query) return [];

    const normQuery = normalizeString(query);
    const queryKata = toKatakana(normQuery);
    const queryHira = toHiragana(normQuery);

    return state.participants.filter((p) => {
      const pLastKana = normalizeString(p.lastNameKana);
      const pFirstKana = normalizeString(p.firstNameKana);
      const fullNameKana = `${pLastKana}${pFirstKana}`;

      // フリガナ一致（最優先）
      if (
        pLastKana.includes(queryKata) ||
        pFirstKana.includes(queryKata) ||
        fullNameKana.includes(queryKata) ||
        pLastKana.includes(queryHira) ||
        pFirstKana.includes(queryHira) ||
        fullNameKana.includes(queryHira)
      ) {
        return true;
      }

      // 漢字氏名・所属・電話番号での検索一致
      const fullName = `${normalizeString(p.lastName)}${normalizeString(p.firstName)}`;
      const org = normalizeString(p.organization);
      const phone = `${p.phone1}${p.phone2}${p.phone3}`;

      return (
        fullName.includes(normQuery) ||
        org.includes(normQuery) ||
        phone.includes(normQuery)
      );
    });
  }

  // 検索入力イベント
  elements.searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (elements.clearSearchButton) {
      if (state.searchQuery) {
        elements.clearSearchButton.classList.remove('hidden');
      } else {
        elements.clearSearchButton.classList.add('hidden');
      }
    }
    renderSearchResults();
  });

  // 検索クリアボタン
  elements.clearSearchButton?.addEventListener('click', () => {
    if (elements.searchInput) {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearchButton.classList.add('hidden');
      elements.searchInput.focus();
      renderSearchResults();
    }
  });

  /**
   * 一覧フィルター切り替え
   */
  elements.filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      elements.filterButtons.forEach((b) => {
        b.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
        b.classList.add('bg-white', 'text-slate-700', 'border', 'border-slate-200');
      });
      btn.classList.remove('bg-white', 'text-slate-700', 'border', 'border-slate-200');
      btn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');

      state.currentFilter = btn.dataset.filter || 'all';
      renderListView();
    });
  });

  /**
   * 現在のタブに応じた描画
   */
  function renderCurrentView() {
    if (state.currentTab === 'search') {
      renderSearchResults();
    } else {
      renderListView();
    }
  }

  /**
   * 検索結果の描画（カード形式）
   */
  function renderSearchResults() {
    if (!elements.searchResultsContainer) return;
    const query = state.searchQuery.trim();

    if (!query) {
      elements.searchResultsContainer.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p class="text-base font-semibold text-slate-600">参加者を検索</p>
          <p class="text-xs text-slate-400 mt-1">姓・名（フリガナ）、氏名（漢字）、所属名を入力してください</p>
        </div>
      `;
      if (elements.searchResultCount) elements.searchResultCount.textContent = '0件';
      return;
    }

    const matches = filterParticipantsBySearch(query);
    if (elements.searchResultCount) elements.searchResultCount.textContent = `${matches.length}件`;

    if (matches.length === 0) {
      elements.searchResultsContainer.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-6">
          <p class="text-base font-bold text-slate-700">該当する参加者が見つかりませんでした</p>
          <p class="text-xs text-slate-500 mt-1">「${query}」に一致するデータはありません。</p>
          <div class="mt-4">
            <a href="./walkin.html" class="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs border border-indigo-200 transition">
              <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              当日参加受付フォームを開く
            </a>
          </div>
        </div>
      `;
      return;
    }

    elements.searchResultsContainer.innerHTML = matches.map((p) => createParticipantCardHtml(p)).join('');
    attachRowClickListeners(elements.searchResultsContainer, '.participant-card');
  }

  /**
   * 一覧表示の描画（スプレッドシート風 表形式 Table）
   */
  function renderListView() {
    if (!elements.listResultsContainer) return;

    let list = [...state.participants];
    switch (state.currentFilter) {
      case 'unregistered':
        list = list.filter((p) => !p.checkedIn);
        break;
      case 'registered':
        list = list.filter((p) => p.checkedIn);
        break;
      case 'walkin':
        list = list.filter((p) => p.isWalkin);
        break;
      case 'bento_pending':
        // 弁当事前注文あり かつ 未引換の人
        list = list.filter((p) => p.bentoOrdered && !(p.bentoConfirmed || p.bentoExchanged));
        break;
      case 'fee_pending':
        list = list.filter((p) => !p.feePaid);
        break;
    }

    if (elements.listResultCount) elements.listResultCount.textContent = `${list.length}件`;

    if (list.length === 0) {
      elements.listResultsContainer.innerHTML = `
        <div class="py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-6">
          <p class="text-base font-bold text-slate-600">対象の参加者がいません</p>
        </div>
      `;
      return;
    }

    // スプレッドシートのような表形式テーブルを生成
    elements.listResultsContainer.innerHTML = `
      <div class="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table class="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-[11px] sm:text-xs font-extrabold text-slate-500 uppercase tracking-wider select-none sticky top-0">
              <th class="py-3 px-3 sm:px-4 text-center w-12">No</th>
              <th class="py-3 px-3 sm:px-4">氏名 (フリガナ)</th>
              <th class="py-3 px-3 sm:px-4">所属 / 役職</th>
              <th class="py-3 px-3 sm:px-4 text-center">受付状況</th>
              <th class="py-3 px-3 sm:px-4 text-center">弁当引換</th>
              <th class="py-3 px-3 sm:px-4 text-center">参加費</th>
              <th class="py-3 px-3 sm:px-4 text-center">受付種別</th>
              <th class="py-3 px-3 sm:px-4">最終更新</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            ${list.map((p, idx) => createParticipantTableRowHtml(p, idx + 1)).join('')}
          </tbody>
        </table>
      </div>
    `;

    attachRowClickListeners(elements.listResultsContainer, '.participant-table-row');
  }

  /**
   * 表形式の1行HTML生成
   */
  function createParticipantTableRowHtml(participant, index) {
    const isCheckedIn = participant.checkedIn;
    const isBentoOrdered = participant.bentoOrdered;
    const isBentoConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
    const isFee = participant.feePaid;
    const isWalkin = participant.isWalkin;

    // 弁当引換ステータスバッジ
    let bentoBadgeHtml = '';
    if (!isBentoOrdered) {
      bentoBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 bg-slate-100">注文なし</span>';
    } else if (isBentoConfirmed) {
      bentoBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200">引換済</span>';
    } else {
      bentoBadgeHtml = '<span class="px-2 py-0.5 rounded text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200">未引換</span>';
    }

    return `
      <tr data-id="${participant.id}"
        class="participant-table-row hover:bg-indigo-50/60 active:bg-indigo-100/60 cursor-pointer transition ${isCheckedIn ? 'bg-indigo-50/20' : ''}">
        <td class="py-3.5 px-3 sm:px-4 text-center text-slate-400 font-mono text-xs">${index}</td>
        <td class="py-3.5 px-3 sm:px-4">
          <div class="text-[11px] font-semibold text-slate-400">${participant.lastNameKana} ${participant.firstNameKana}</div>
          <div class="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">${participant.lastName} ${participant.firstName}</div>
        </td>
        <td class="py-3.5 px-3 sm:px-4">
          <div class="text-xs sm:text-sm font-bold text-slate-700">${participant.organization || '-'}</div>
          <div class="text-[11px] text-slate-400">${participant.position || '-'}</div>
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${isCheckedIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'}">
            ${isCheckedIn ? '受付済' : '未受付'}
          </span>
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          ${bentoBadgeHtml}
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${isFee ? 'bg-violet-100 text-violet-800 border border-violet-300' : 'bg-slate-100 text-slate-500'}">
            ${isFee ? '支払済' : '未受領'}
          </span>
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-center">
          ${isWalkin 
            ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">当日</span>'
            : '<span class="text-slate-400 text-xs font-normal">事前</span>'
          }
        </td>
        <td class="py-3.5 px-3 sm:px-4 text-slate-400 font-mono text-[11px]">
          ${participant.updatedAt || '-'}
        </td>
      </tr>
    `;
  }

  /**
   * 検索用カードHTML生成
   */
  function createParticipantCardHtml(participant) {
    const isCheckedIn = participant.checkedIn;
    const isBentoOrdered = participant.bentoOrdered;
    const isBentoConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
    const isFee = participant.feePaid;
    const isWalkin = participant.isWalkin;

    let bentoBadge = '';
    if (!isBentoOrdered) {
      bentoBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400">弁当: 注文無</span>';
    } else if (isBentoConfirmed) {
      bentoBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">弁当引換済</span>';
    } else {
      bentoBadge = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">弁当未引換</span>';
    }

    return `
      <div data-id="${participant.id}"
        class="participant-card touch-target bg-white rounded-2xl border ${isCheckedIn ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200'} p-4 sm:p-5 shadow-sm hover:shadow-md active:scale-[0.99] transition cursor-pointer flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-slate-500 tracking-wide">
              ${participant.lastNameKana} ${participant.firstNameKana}
            </span>
            ${isWalkin ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">当日</span>' : ''}
          </div>

          <h3 class="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mb-1">
            ${participant.lastName} ${participant.firstName}
          </h3>

          <p class="text-sm font-medium text-slate-600 truncate mb-3">
            ${participant.organization || '所属なし'} <span class="text-slate-400 font-normal">/ ${participant.position || '-'}</span>
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100">
          <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${isCheckedIn ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'}">
            ${isCheckedIn ? '受付済' : '未受付'}
          </span>
          ${bentoBadge}
          <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${isFee ? 'bg-violet-100 text-violet-800 border border-violet-300' : 'bg-slate-100 text-slate-500'}">
            ${isFee ? '支払済' : '未受領'}
          </span>
        </div>
      </div>
    `;
  }

  /**
   * 行/カードクリックイベントのアタッチ
   */
  function attachRowClickListeners(container, selector) {
    const items = container.querySelectorAll(selector);
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const participant = state.participants.find((p) => p.id === id);
        if (participant) {
          openDetailModal(participant);
        }
      });
    });
  }

  /**
   * 詳細モーダルを開く
   */
  function openDetailModal(participant) {
    state.selectedParticipant = participant;

    if (elements.modalName) elements.modalName.textContent = `${participant.lastName} ${participant.firstName}`;
    if (elements.modalKana) elements.modalKana.textContent = `${participant.lastNameKana} ${participant.firstNameKana}`;
    if (elements.modalOrg) elements.modalOrg.textContent = participant.organization || '-';
    if (elements.modalPosition) elements.modalPosition.textContent = participant.position || '-';
    if (elements.modalId) elements.modalId.textContent = participant.id ? participant.id.substring(0, 8).toUpperCase() : '-';
    if (elements.modalPhone) elements.modalPhone.textContent = [participant.phone1, participant.phone2, participant.phone3].filter(Boolean).join('-') || '-';
    if (elements.modalEmail) elements.modalEmail.textContent = participant.email || '-';
    if (elements.modalLocation) elements.modalLocation.textContent = participant.location || '-';
    if (elements.modalTransport) elements.modalTransport.textContent = participant.transportation || '-';
    if (elements.modalGrade) elements.modalGrade.textContent = participant.desiredGrade || '-';
    if (elements.modalSub1) elements.modalSub1.textContent = participant.subcommittee1 || '-';
    if (elements.modalSub2) elements.modalSub2.textContent = participant.subcommittee2 || '-';
    if (elements.modalNotes) elements.modalNotes.textContent = participant.notes || 'なし';
    if (elements.modalUpdatedAt) elements.modalUpdatedAt.textContent = participant.updatedAt || '-';

    if (elements.modalWalkinBadge) {
      if (participant.isWalkin) {
        elements.modalWalkinBadge.classList.remove('hidden');
      } else {
        elements.modalWalkinBadge.classList.add('hidden');
      }
    }

    // トグルボタンの状態更新
    updateModalToggleButtons(participant);

    elements.detailModal?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  /**
   * モーダル内トグルボタンの表示状態更新
   * （タップで受付などの補足表記を廃止し、シンプルに表現）
   */
  function updateModalToggleButtons(participant) {
    // 1. 受付状況 (R列)
    if (elements.toggleCheckinBtn) {
      if (participant.checkedIn) {
        elements.toggleCheckinBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-emerald-600 text-white font-extrabold text-base shadow-md shadow-emerald-200 active:scale-[0.98] transition flex items-center justify-center space-x-2';
        elements.toggleCheckinBtn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          <span>受付済</span>
        `;
      } else {
        elements.toggleCheckinBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-base border border-slate-300 active:scale-[0.98] transition flex items-center justify-center space-x-2';
        elements.toggleCheckinBtn.innerHTML = `
          <span class="w-3.5 h-3.5 rounded-full border-2 border-slate-400"></span>
          <span>未受付</span>
        `;
      }
    }

    // 2. 弁当引換 (S列: 注文有無, W列: 引換確認)
    if (elements.toggleBentoBtn) {
      if (!participant.bentoOrdered) {
        // 事前注文なしの場合は無効化表示
        elements.toggleBentoBtn.disabled = true;
        elements.toggleBentoBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-slate-50 text-slate-400 font-bold text-sm border border-dashed border-slate-300 cursor-not-allowed flex items-center justify-center space-x-1.5';
        elements.toggleBentoBtn.innerHTML = `
          <span>弁当注文なし</span>
        `;
      } else {
        // 事前注文あり
        elements.toggleBentoBtn.disabled = false;
        const isConfirmed = participant.bentoConfirmed || participant.bentoExchanged;
        if (isConfirmed) {
          elements.toggleBentoBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-indigo-600 text-white font-extrabold text-base shadow-md shadow-indigo-200 active:scale-[0.98] transition flex items-center justify-center space-x-2';
          elements.toggleBentoBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>弁当券引換済</span>
          `;
        } else {
          elements.toggleBentoBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-base border border-slate-300 active:scale-[0.98] transition flex items-center justify-center space-x-2';
          elements.toggleBentoBtn.innerHTML = `
            <span class="w-3.5 h-3.5 rounded-full border-2 border-slate-400"></span>
            <span>弁当券未引換</span>
          `;
        }
      }
    }

    // 3. 参加費支払 (T列)
    if (elements.toggleFeeBtn) {
      if (participant.feePaid) {
        elements.toggleFeeBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-violet-600 text-white font-extrabold text-base shadow-md shadow-violet-200 active:scale-[0.98] transition flex items-center justify-center space-x-2';
        elements.toggleFeeBtn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          <span>参加費受領済</span>
        `;
      } else {
        elements.toggleFeeBtn.className = 'touch-target py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-base border border-slate-300 active:scale-[0.98] transition flex items-center justify-center space-x-2';
        elements.toggleFeeBtn.innerHTML = `
          <span class="w-3.5 h-3.5 rounded-full border-2 border-slate-400"></span>
          <span>未受領</span>
        `;
      }
    }
  }

  /**
   * モーダルを閉じる
   */
  function closeDetailModal() {
    elements.detailModal?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.selectedParticipant = null;
  }

  elements.modalCloseButton?.addEventListener('click', closeDetailModal);
  elements.modalBackdrop?.addEventListener('click', closeDetailModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.detailModal?.classList.contains('hidden')) {
      closeDetailModal();
    }
  });

  /**
   * ステータス更新トリガー
   */
  async function handleToggleStatus(field) {
    if (!state.selectedParticipant) return;

    const currentParticipant = state.selectedParticipant;

    if (field === 'checkedIn') {
      currentParticipant.checkedIn = !currentParticipant.checkedIn;
    } else if (field === 'bentoConfirmed') {
      // 注文がない場合は何もしない
      if (!currentParticipant.bentoOrdered) return;
      const nextState = !(currentParticipant.bentoConfirmed || currentParticipant.bentoExchanged);
      currentParticipant.bentoConfirmed = nextState;
      currentParticipant.bentoExchanged = nextState;
    } else if (field === 'feePaid') {
      currentParticipant.feePaid = !currentParticipant.feePaid;
    }

    updateModalToggleButtons(currentParticipant);
    updateStatistics();
    renderCurrentView();

    // キャッシュの更新
    window.queueManager?.setCachedParticipants(state.participants);

    const payload = {
      id: currentParticipant.id,
      checkedIn: currentParticipant.checkedIn,
      bentoConfirmed: currentParticipant.bentoConfirmed || currentParticipant.bentoExchanged,
      bentoExchanged: currentParticipant.bentoConfirmed || currentParticipant.bentoExchanged,
      feePaid: currentParticipant.feePaid,
      rowIndex: currentParticipant.rowIndex,
    };

    // オンラインであればAPI送信、失敗またはオフライン時はキューに追加
    if (navigator.onLine) {
      try {
        const baseUrl = window.AppConfig?.apiBaseUrl || '';
        const response = await fetch(`${baseUrl}/api/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('API更新失敗');
        }

        const result = await response.json();
        if (result.success && result.data?.updatedAt) {
          currentParticipant.updatedAt = result.data.updatedAt;
          if (elements.modalUpdatedAt) elements.modalUpdatedAt.textContent = result.data.updatedAt;
        }
      } catch (error) {
        console.warn('[Update] API直接通信失敗のためオフラインキューへ退避:', error);
        window.queueManager?.enqueueUpdate(payload);
      }
    } else {
      console.log('[Update] オフラインのためキューへ追加:', payload);
      window.queueManager?.enqueueUpdate(payload);
    }
  }

  elements.toggleCheckinBtn?.addEventListener('click', () => handleToggleStatus('checkedIn'));
  elements.toggleBentoBtn?.addEventListener('click', () => handleToggleStatus('bentoConfirmed'));
  elements.toggleFeeBtn?.addEventListener('click', () => handleToggleStatus('feePaid'));

  /**
   * 手動データ同期ボタン
   */
  elements.syncButton?.addEventListener('click', async () => {
    // 1. キューに溜まっている未送信データを送信
    if (window.queueManager) {
      await window.queueManager.processQueue();
    }
    // 2. スプレッドシートから最新データを再取得
    await fetchParticipantsFromApi();
  });

  // 初期化実行
  checkAuthentication();
});

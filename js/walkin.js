/**
 * 当日参加者受付フォーム (walkin.html) 制御スクリプト
 */

document.addEventListener('DOMContentLoaded', () => {
  const formElement = document.getElementById('walkinForm');
  const submitButton = document.getElementById('submitButton');
  const buttonSpinner = document.getElementById('buttonSpinner');
  const buttonText = document.getElementById('buttonText');
  const alertContainer = document.getElementById('alertContainer');
  const formSection = document.getElementById('formSection');
  const completionSection = document.getElementById('completionSection');
  const registeredNameSpan = document.getElementById('registeredName');
  const registeredIdSpan = document.getElementById('registeredId');
  const resetFormButton = document.getElementById('resetFormButton');

  // プルダウン要素
  const desiredGradeSelect = document.getElementById('desiredGrade');
  const subcommittee1Select = document.getElementById('subcommittee1');
  const subcommittee2Select = document.getElementById('subcommittee2');

  /**
   * 選択肢マスタ（GET /api/options）を取得してプルダウンに動的生成
   */
  async function loadFormOptions() {
    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    try {
      const response = await fetch(`${baseUrl}/api/options`);
      if (!response.ok) throw new Error(`選択肢取得エラー: ${response.status}`);

      const result = await response.json();
      if (result.success && result.data) {
        populateSelect(desiredGradeSelect, result.data.desiredGrade, '授業公開希望学年を選択');
        populateSelect(subcommittee1Select, result.data.subcommittee1, '分科会（第1希望）を選択');
        populateSelect(subcommittee2Select, result.data.subcommittee2, '分科会（第2希望）を選択');
      }
    } catch (error) {
      console.warn('[Options Warning] 選択肢マスタの取得に失敗したためデフォルト選択肢を使用します:', error);
      // フォールバック選択肢
      populateSelect(
        desiredGradeSelect,
        ['【A1】第4学年', '【A2】第5学年', '【A3】第6学年'],
        '授業公開希望学年を選択'
      );
      const defaultSubs = [
        '【B1】話すこと・聞くこと',
        '【B2】書くこと',
        '【B3】読むこと（文学）',
        '【B4】読むこと（説明）',
      ];
      populateSelect(subcommittee1Select, defaultSubs, '分科会（第1希望）を選択');
      populateSelect(subcommittee2Select, defaultSubs, '分科会（第2希望）を選択');
    }
  }

  /**
   * select要素にoptionを生成
   */
  function populateSelect(selectElement, optionsList, defaultPlaceholder = '選択してください') {
    if (!selectElement || !Array.isArray(optionsList)) return;
    const currentVal = selectElement.value;
    selectElement.innerHTML = `<option value="">${defaultPlaceholder}</option>`;

    optionsList.forEach((opt) => {
      const optionElem = document.createElement('option');
      optionElem.value = opt;
      optionElem.textContent = opt;
      if (opt === currentVal) {
        optionElem.selected = true;
      }
      selectElement.appendChild(optionElem);
    });
  }

  /**
   * エラー・成功アラートメッセージの表示
   */
  function showAlert(message, type = 'error') {
    if (!alertContainer) return;

    const isError = type === 'error';
    alertContainer.className = `p-4 rounded-xl mb-6 text-sm font-medium flex items-start gap-3 animate-fade-in ${
      isError ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    }`;

    alertContainer.innerHTML = `
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5 ${isError ? 'text-rose-500' : 'text-emerald-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${isError 
          ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />'
          : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />'
        }
      </svg>
      <div class="flex-1">${message}</div>
    `;
    alertContainer.classList.remove('hidden');

    // 画面上部へスムーズスクロール
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * アラートの非表示
   */
  function clearAlert() {
    if (!alertContainer) return;
    alertContainer.classList.add('hidden');
    alertContainer.innerHTML = '';
  }

  /**
   * ボタン送信中状態の切り替え
   */
  function setSubmittingState(isSubmitting) {
    if (!submitButton) return;
    submitButton.disabled = isSubmitting;
    if (isSubmitting) {
      submitButton.classList.add('opacity-75', 'cursor-not-allowed');
      buttonSpinner?.classList.remove('hidden');
      if (buttonText) buttonText.textContent = '受付データを送信中...';
    } else {
      submitButton.classList.remove('opacity-75', 'cursor-not-allowed');
      buttonSpinner?.classList.add('hidden');
      if (buttonText) buttonText.textContent = '当日参加を受付する';
    }
  }

  /**
   * ひらがな→カタカナ自動変換
   */
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0x60)
    );
  }

  // フリガナ入力時に自動でカタカナへ正規化
  const lastNameKanaInput = document.getElementById('lastNameKana');
  const firstNameKanaInput = document.getElementById('firstNameKana');

  lastNameKanaInput?.addEventListener('blur', (e) => {
    e.target.value = toKatakana(e.target.value.trim());
  });
  firstNameKanaInput?.addEventListener('blur', (e) => {
    e.target.value = toKatakana(e.target.value.trim());
  });

  // 電話番号の入力制限とオートフォーカス移動
  const phone1Input = document.getElementById('phone1');
  const phone2Input = document.getElementById('phone2');
  const phone3Input = document.getElementById('phone3');

  const setupAutoTab = (currentInput, nextInput, maxLength) => {
    currentInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
      if (e.target.value.length >= maxLength && nextInput) {
        nextInput.focus();
      }
    });
  };

  setupAutoTab(phone1Input, phone2Input, 3);
  setupAutoTab(phone2Input, phone3Input, 4);
  phone3Input?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  });

  /**
   * フォーム送信ハンドラー
   */
  formElement?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    // フォームデータの抽出
    const formData = new FormData(formElement);
    const lastName = String(formData.get('lastName') || '').trim();
    const firstName = String(formData.get('firstName') || '').trim();
    const lastNameKana = toKatakana(String(formData.get('lastNameKana') || '').trim());
    const firstNameKana = toKatakana(String(formData.get('firstNameKana') || '').trim());
    const organization = String(formData.get('organization') || '').trim();
    const position = String(formData.get('position') || '').trim();
    const location = String(formData.get('location') || '').trim();
    const phone1 = String(formData.get('phone1') || '').trim();
    const phone2 = String(formData.get('phone2') || '').trim();
    const phone3 = String(formData.get('phone3') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const transportation = String(formData.get('transportation') || '').trim();
    const desiredGrade = String(formData.get('desiredGrade') || '').trim();
    const subcommittee1 = String(formData.get('subcommittee1') || '').trim();
    const subcommittee2 = String(formData.get('subcommittee2') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    // バリデーション
    if (!lastName || !firstName) {
      showAlert('氏名（姓・名）を両方入力してください。');
      return;
    }

    if (!lastNameKana || !firstNameKana) {
      showAlert('氏名フリガナ（セイ・メイ）を両方入力してください。');
      return;
    }

    if (!organization) {
      showAlert('所属（学校名・法人名）を入力してください。');
      return;
    }

    // カタカナ形式チェック
    const isKana = (val) => /^[\u30A0-\u30FFー]+$/.test(val);
    if (!isKana(lastNameKana) || !isKana(firstNameKana)) {
      showAlert('フリガナは全角カタカナで入力してください。');
      return;
    }

    // リクエストペイロードの作成
    const payload = {
      organization,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      phone1,
      phone2,
      phone3,
      email,
      position,
      transportation,
      desiredGrade,
      subcommittee1,
      subcommittee2,
      notes,
      location,
      checkedIn: false, // 当日受付時の初期ステータスは未受付（FALSE）
      bentoOrdered: false,
      bentoConfirmed: false,
      feePaid: false,
      feeConfirmed: false,
    };

    setSubmittingState(true);

    try {
      const baseUrl = window.AppConfig?.apiBaseUrl || '';
      const response = await fetch(`${baseUrl}/api/walkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '登録処理に失敗しました。受付スタッフにお声がけください。');
      }

      // 登録完了画面への切り替え
      if (formSection && completionSection) {
        formSection.classList.add('hidden');
        completionSection.classList.remove('hidden');

        if (registeredNameSpan) {
          registeredNameSpan.textContent = `${lastName} ${firstName}`;
        }
        if (registeredIdSpan && result.data?.id) {
          registeredIdSpan.textContent = result.data.id.substring(0, 8).toUpperCase();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '通信エラーが発生しました。電波状況をご確認ください。';
      showAlert(message);
    } finally {
      setSubmittingState(false);
    }
  });

  /**
   * 大会名などの公開設定情報を取得し、画面およびドキュメントタイトルに動的反映
   */
  async function loadConferenceSettings() {
    const baseUrl = window.AppConfig?.apiBaseUrl || '';
    try {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) return;

      const result = await response.json();
      if (result.success && result.data?.conferenceName) {
        const confName = result.data.conferenceName;
        // 1. タイトルタグの動的更新
        document.title = `${confName} - 当日参加受付`;
        // 2. 指定されたクラス要素のテキスト更新
        document.querySelectorAll('.conference-name').forEach((el) => {
          el.textContent = confName;
        });
      }
    } catch (error) {
      console.warn('[Settings Warning] 設定情報の取得に失敗しました:', error);
    }
  }

  // 設定情報および選択肢マスタの読み込み実行
  loadConferenceSettings();
  loadFormOptions();
});

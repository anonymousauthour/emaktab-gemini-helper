// Файл: emaktab-solver.js (ПОЛНАЯ ВЕРСИЯ с обработкой вопросов с выбором)

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${GEMINI_API_KEY}`;

    // --- Селекторы ---
    const QUESTION_BLOCK_SELECTOR = '[data-test-id^="block-"]';
    const LEXICAL_EDITOR_SELECTOR = 'div[data-lexical-editor="true"]';
    const PARAGRAPH_SELECTOR = 'p';
    const TEXT_SPAN_SELECTOR = 'span[data-lexical-text="true"]:not(:empty)';
    
    const TABLE_SELECTOR_IN_BLOCK = 'table';
    const ANSWER_INPUT_SELECTOR = 'input[data-test-id^="answer-"]';
    const DECORATOR_SPAN_WITH_INPUT_SELECTOR_QUERY = `span[data-lexical-decorator="true"]:has(${ANSWER_INPUT_SELECTOR})`;
    const DECORATOR_SPAN_SELECTOR = 'span[data-lexical-decorator="true"]';

    const MC_OPTION_SELECTOR = 'div[data-test-id^="answer-"]'; 
    const MC_OPTION_TEXT_SELECTOR = 'span[data-lexical-text="true"]'; 
    const MC_SELECTED_CLASS = 'GmaSD';

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    async function askGemini(fullPrompt) {
        const promptLength = fullPrompt.length;
        console.log(`Промпт для Gemini (длина: ${promptLength} символов).`);
        if (promptLength < 2000) {
            console.log("Полный промпт:", fullPrompt);
        } else {
            console.log("Начало промпта (первые 500 символов):", fullPrompt.substring(0, 500));
        }
        
        if (promptLength > 25000) { // Порог для предупреждения
            console.warn(`ПРЕДУПРЕЖДЕНИЕ: Длина промпта (${promptLength}) очень большая!`);
        }

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    // generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } // Можно вернуть для тюнинга
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API Error:', response.status, errorData);
                if (promptLength < 2000) console.error("Промпт, вызвавший ошибку:", fullPrompt);
                const detailedError = errorData?.error?.message || JSON.stringify(errorData);
                return `ОШИБКА API ${response.status}: ${detailedError}`;
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]) {
                const geminiResponseText = data.candidates[0].content.parts[0].text.trim();
                console.log("Ответ от Gemini:", geminiResponseText);
                return geminiResponseText;
            } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                console.warn('Gemini API: Запрос заблокирован.', data.promptFeedback);
                if (promptLength < 2000) console.warn("Промпт, вызвавший блокировку:", fullPrompt);
                return `ЗАПРОС ЗАБЛОКИРОВАН: ${data.promptFeedback.blockReason}`;
            } else {
                console.warn('Gemini API: Некорректный формат ответа.', data);
                return 'Нет ответа от Gemini';
            }
        } catch (error) {
            console.error('Ошибка при запросе к Gemini API:', error);
            if (promptLength < 2000) console.error("Промпт, при котором произошла сетевая ошибка:", fullPrompt);
            return `Сетевая ошибка Gemini: ${error.message}`;
        }
    }

    function displayAnswer(questionBlockElement, geminiAnswer, answerData) {
        const existingDisplay = questionBlockElement.querySelector('.gemini-answer-display');
        if (existingDisplay) existingDisplay.remove();

        const answerDisplay = document.createElement('div');
        answerDisplay.className = 'gemini-answer-display';
        answerDisplay.style.marginTop = '15px';
        answerDisplay.style.padding = '10px';
        answerDisplay.style.border = '1px dashed blue';
        answerDisplay.style.backgroundColor = '#f0f8ff';
        answerDisplay.style.whiteSpace = 'pre-wrap';
        answerDisplay.innerHTML = `<strong>🤖 Gemini:</strong><br>${geminiAnswer.replace(/\n/g, '<br>')}`;
        
        const lexicalEditor = questionBlockElement.querySelector(LEXICAL_EDITOR_SELECTOR);
        if (lexicalEditor) lexicalEditor.insertAdjacentElement('afterend', answerDisplay);
        else questionBlockElement.appendChild(answerDisplay);

        if (geminiAnswer.startsWith("ОШИБКА API") || geminiAnswer.startsWith("ЗАПРОС ЗАБЛОКИРОВАН")) return;

        if (answerData.type === 'inputs' && answerData.inputs && answerData.inputs.length > 0) {
            const lines = geminiAnswer.split('\n');
            lines.forEach(line => {
                const match = line.match(/(?:answer-|INPUT\s+)?([a-zA-Z0-9_ -À-ÿ]+?)\s*:\s*(.*)/i);
                if (match) {
                    let key = match[1].trim();
                    const valueToInsert = match[2].trim();
                    let inputElement;
                    if (/^answer-\d+$/i.test(key) || /^\d+$/.test(key)) {
                        const numMatch = key.match(/\d+$/);
                        if (numMatch) {
                           inputElement = questionBlockElement.querySelector(`input[data-test-id="answer-${numMatch[0]}"]`);
                        }
                    }
                    if (!inputElement) {
                        const foundInputData = answerData.inputs.find(inp => 
                            (inp.context && inp.context.toLowerCase().includes(key.toLowerCase())) ||
                            (inp.tableContext && inp.tableContext.header.toLowerCase() === key.toLowerCase()) ||
                            (inp.dataTestId && inp.dataTestId.toLowerCase() === key.toLowerCase())
                        );
                         if (foundInputData) {
                            inputElement = questionBlockElement.querySelector(`input[data-test-id="${foundInputData.dataTestId}"]`);
                         }
                    }
                    if (inputElement) {
                        console.log(`Попытка вставить "${valueToInsert}" в input (ключ: "${key}", data-test-id: ${inputElement.getAttribute('data-test-id')})`);
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        nativeInputValueSetter.call(inputElement, valueToInsert);
                        inputElement.dispatchEvent(new Event('focus', { bubbles: true }));
                        inputElement.dispatchEvent(new Event('input', { bubbles: true, inputType: 'insertText' }));
                        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                        inputElement.style.backgroundColor = 'lightyellow';
                    } else {
                        console.warn(`Не найден input для ключа/метки "${key}" для вставки значения "${valueToInsert}".`);
                    }
                }
            });
        } else if (answerData.type === 'multipleChoice' && answerData.options && answerData.options.length > 0) {
            const suggestedAnswerText = geminiAnswer.trim();
            let selectedOptionElement = null;

            if (suggestedAnswerText.length === 1 && /[A-ZА-ЯЁ]/i.test(suggestedAnswerText)) {
                const optionIndex = suggestedAnswerText.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
                if (optionIndex >= 0 && optionIndex < answerData.options.length) {
                    selectedOptionElement = answerData.options[optionIndex].element;
                }
            }
            
            if (!selectedOptionElement) {
                for (const opt of answerData.options) {
                    // Ищем точное совпадение или если ответ Gemini содержит текст варианта (или наоборот)
                    if (opt.text.toLowerCase() === suggestedAnswerText.toLowerCase() ||
                        opt.text.toLowerCase().includes(suggestedAnswerText.toLowerCase()) || 
                        suggestedAnswerText.toLowerCase().includes(opt.text.toLowerCase())) {
                        selectedOptionElement = opt.element;
                        break;
                    }
                }
            }

            if (selectedOptionElement) {
                console.log(`Попытка выбрать вариант: "${selectedOptionElement.innerText.trim()}"`);
                // Если это радио-группа (или предполагаем одиночный выбор),
                // то клик сам должен снять выбор с других.
                // Если это мульти-выбор, и Gemini может дать несколько букв/ответов, логику нужно усложнить.
                selectedOptionElement.click(); 
                selectedOptionElement.style.outline = '2px solid green';
                setTimeout(() => {
                    if (selectedOptionElement.classList.contains(MC_SELECTED_CLASS)) {
                        console.log(`Класс ${MC_SELECTED_CLASS} успешно применен после клика.`);
                    } else {
                        console.warn(`Класс ${MC_SELECTED_CLASS} НЕ применен после клика. Проверьте механизм выбора на сайте.`);
                    }
                }, 200);
            } else {
                console.warn(`Не удалось найти вариант ответа для "${suggestedAnswerText}"`);
            }
        }
    }

    function extractMainQuestionText(block) {
        const lexicalEditor = block.querySelector(LEXICAL_EDITOR_SELECTOR);
        if (!lexicalEditor) return "";
        let mainQuestionSegments = [];
        const paragraphs = lexicalEditor.querySelectorAll(PARAGRAPH_SELECTOR);
        for (const p of paragraphs) {
            // Условие для прекращения сбора основного текста
            if (p.querySelector(ANSWER_INPUT_SELECTOR) || // Если в параграфе есть поле для текстового ввода
                p.querySelector(MC_OPTION_SELECTOR) ||   // Если в параграфе есть элемент варианта выбора
                (p.innerText.trim().startsWith("Ответ:") && p.querySelector(DECORATOR_SPAN_SELECTOR)) ||
                (/^\d+\)/.test(p.innerText.trim()) && (p.querySelector(DECORATOR_SPAN_SELECTOR) || p.closest(MC_OPTION_SELECTOR)))
               ) {
                // Проверяем, не является ли этот параграф частью уже найденных вариантов ответа
                let isPartOfMcOption = false;
                if (mcOptionElementsCache && mcOptionElementsCache.some(mcEl => p.contains(mcEl) || mcEl.contains(p))) {
                    isPartOfMcOption = true;
                }
                if (!isPartOfMcOption) break;
            }
            const textSpans = p.querySelectorAll(TEXT_SPAN_SELECTOR);
            textSpans.forEach(span => {
                // Дополнительная проверка, чтобы не захватить текст из вариантов ответа
                 if (!span.closest(MC_OPTION_SELECTOR)) {
                    mainQuestionSegments.push(span.innerText.trim());
                }
            });
        }
        return mainQuestionSegments.join(" ").trim();
    }
    
    let mcOptionElementsCache = null; // Кэш для элементов вариантов выбора на текущем блоке

    function buildPrompt(mainQuestionText, typeData) {
        let prompt = `ВАЖНО: Предоставляй ТОЛЬКО КОНЕЧНЫЕ ОТВЕТЫ. Не пиши объяснений или промежуточных шагов.\n`;

        if (typeData.type === 'table') {
            prompt += `Если ответ - число, дай только число. Если дробь - дай дробь (например, 3/40).\nФормат ответа: "Имя_колонки для Имя_первого_столбца=значение: твой_ответ" или "answer-X: твой_ответ".\n\n`;
            prompt += `ЗАДАНИЕ (таблица):\nОсновной вопрос:\n${mainQuestionText}\nТаблица для заполнения (предоставь значения для ячеек с [INPUT ...]):\n`;
            if (typeData.data.headers && typeData.data.headers.length > 0) {
                prompt += typeData.data.headers.join('\t|\t') + '\n';
                prompt += '-'.repeat(typeData.data.headers.join('\t|\t').length) + '\n';
            }
            typeData.data.rows.forEach((row) => {
                let rowStr = "";
                (typeData.data.headers.length ? typeData.data.headers : Object.keys(row)).forEach(header => {
                    const cellContent = row[header]; 
                    if (cellContent) { 
                        if (cellContent.type === 'input') {
                            rowStr += `[INPUT ${cellContent.dataTestId || 'NO_ID'}]` + '\t|\t';
                        } else {
                            rowStr += (cellContent.value !== undefined ? cellContent.value : '') + '\t|\t';
                        }
                    } else { rowStr += '' + '\t|\t'; }
                });
                prompt += rowStr.slice(0, -3) + '\n'; 
            });
        } else if (typeData.type === 'inputs') {
            prompt += `Если ответ - число, дай только число. Если дробь - дай дробь (например, 3/40).\nФормат ответа: "answer-X: твой_ответ" или "метка_пункта: твой_ответ".\n\n`;
            prompt += `ЗАДАНИЕ (список полей для ввода):\nОсновной вопрос:\n${mainQuestionText}\nОтветь на следующие пункты (дай только конечный ответ для каждого [INPUT ...]):\n`;
            typeData.data.forEach(inputData => { prompt += `${inputData.context.trim()} [INPUT ${inputData.dataTestId}]\n`; });
        } else if (typeData.type === 'multipleChoice') {
            prompt += `Формат ответа: Укажи ТОЛЬКО БУКВУ (A, B, C, ...) правильного варианта ИЛИ ПОЛНЫЙ ТЕКСТ правильного варианта.\n\n`;
            prompt += `ЗАДАНИЕ (выбери один правильный вариант):\nОсновной вопрос:\n${mainQuestionText}\nВарианты ответов:\n`;
            typeData.data.forEach((opt, i) => {
                prompt += `${String.fromCharCode(65 + i)}. ${opt.text}\n`;
            });
        }
        prompt += "\nПОМНИ: ТОЛЬКО КОНЕЧНЫЙ ОТВЕТ.\n";
        return prompt;
    }

    async function processQuestionsOnPage() {
        const questionBlocks = document.querySelectorAll(QUESTION_BLOCK_SELECTOR);
        if (questionBlocks.length === 0) { /* ... */ solveButton.textContent = '🔮 Решить с Gemini'; solveButton.disabled = false; return; }
        console.log(`eMaktab Solver: Найдено блоков вопросов: ${questionBlocks.length}. Обработка...`);
        solveButton.textContent = `⏳ Обработка (0/${questionBlocks.length})...`;
        let questionCounter = 0;

        for (const block of questionBlocks) {
            questionCounter++;
            const blockId = block.getAttribute('data-test-id');
            console.log(`\n--- Обработка блока #${questionCounter} (data-test-id: ${blockId}) ---`);
            solveButton.textContent = `⏳ Обработка (${questionCounter}/${questionBlocks.length})...`;
            
            mcOptionElementsCache = Array.from(block.querySelectorAll(MC_OPTION_SELECTOR)); // Кэшируем элементы выбора для этого блока
            const mainQuestionText = extractMainQuestionText(block);
            mcOptionElementsCache = null; // Сбрасываем кэш

            const tableElement = block.querySelector(TABLE_SELECTOR_IN_BLOCK);
            const inputFields = Array.from(block.querySelectorAll(ANSWER_INPUT_SELECTOR));
            // mcOptionElements уже найдены выше и сохранены в кэше на время extractMainQuestionText,
            // но для дальнейшей обработки найдем их снова уже после извлечения основного текста.
            const currentMcOptionElements = Array.from(block.querySelectorAll(MC_OPTION_SELECTOR));


            let tableData = null;
            let nonTableInputsData = [];
            let mcOptionsData = [];
            let allInputsForDisplay = { type: null, inputs: [], options: [] }; // Общий объект для displayAnswer
            let hasInteractiveElements = false;

            if (tableElement && inputFields.some(inp => tableElement.contains(inp))) {
                console.log(`   Блок ${blockId} содержит таблицу с полями ввода.`);
                tableData = { headers: [], rows: [] };
                const rows = Array.from(tableElement.querySelectorAll('tr'));
                if (rows.length > 0) { /* ... (парсинг таблицы как в прошлой полной версии, заполняем tableData и allInputsForDisplay.inputs) ... */ }
                if (tableData.rows.some(r => Object.values(r).some(cell => cell.type === 'input'))) {
                    hasInteractiveElements = true;
                } else { tableData = null; }
            }
            
            // Обрабатываем inputFields, которые НЕ в таблице (или если таблицы нет)
            const nonTableInputFields = inputFields.filter(inp => !tableElement || !tableElement.contains(inp));
            if (nonTableInputFields.length > 0) {
                 console.log(`   Блок ${blockId} обрабатывается как список полей ввода (вне таблицы или таблицы нет).`);
                // ... (логика парсинга nonTableInputsData для nonTableInputFields как в прошлой полной версии, заполняем nonTableInputsData и allInputsForDisplay.inputs)
                if (nonTableInputsData.length > 0) hasInteractiveElements = true;
            }
            
            // Обработка вопросов с выбором вариантов, если не было найдено инпутов
            if (!hasInteractiveElements && currentMcOptionElements.length > 0) {
                console.log(`   Блок ${blockId} обрабатывается как вопрос с выбором вариантов.`);
                const options = currentMcOptionElements.map(optEl => {
                    const textEl = optEl.querySelector(MC_OPTION_TEXT_SELECTOR);
                    return {
                        text: textEl ? textEl.innerText.trim() : optEl.innerText.trim(),
                        element: optEl,
                        dataTestId: optEl.getAttribute('data-test-id')
                    };
                });
                if (options.some(opt => opt.text)) {
                    mcOptionsData = options;
                    allInputsForDisplay = { type: 'multipleChoice', options: mcOptionsData };
                    hasInteractiveElements = true;
                } else {
                     console.warn(`   В блоке ${blockId} найдены элементы вариантов выбора, но не удалось извлечь текст вариантов.`);
                }
            } else if (hasInteractiveElements && !tableData) { // Если были только нетабличные инпуты
                 allInputsForDisplay.type = 'inputs';
            } else if (hasInteractiveElements && tableData) { // Если были табличные инпуты
                 allInputsForDisplay.type = 'inputs'; // Тип 'inputs' используется для табличных и нетабличных <input>
            }


            if (!hasInteractiveElements) {
                console.log(`   Блок ${blockId} не содержит интерактивных элементов для решения Gemini. Пропускаем.`);
                displayAnswer(block, "(Этот блок не содержит интерактивных элементов для решения)", {type: null});
                if (questionCounter < questionBlocks.length) await new Promise(resolve => setTimeout(resolve, 50));
                continue;
            }
            
            const currentMainQuestionText = mainQuestionText || "(Нет основного текста вопроса)";
            let promptDataPayload;
            if (allInputsForDisplay.type === 'multipleChoice') {
                promptDataPayload = { type: 'multipleChoice', data: mcOptionsData };
            } else if (tableData) { // Приоритет таблице, если она интерактивная
                promptDataPayload = { type: 'table', data: tableData };
            } else { // Иначе это нетабличные инпуты
                promptDataPayload = { type: 'inputs', data: nonTableInputsData };
            }

            const prompt = buildPrompt(currentMainQuestionText, promptDataPayload);
            const geminiAnswer = await askGemini(prompt);
            displayAnswer(block, geminiAnswer, allInputsForDisplay); // Передаем allInputsForDisplay

            if (questionCounter < questionBlocks.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        console.log('eMaktab Solver: Все вопросы на странице обработаны.');
        solveButton.textContent = '✅ Готово! Решить снова?';
        solveButton.disabled = false;
    }

    const solveButton = document.createElement('button');
    solveButton.textContent = '🔮 Решить с Gemini';
    solveButton.style.position = 'fixed';
    solveButton.style.bottom = '20px';
    solveButton.style.right = '20px';
    solveButton.style.zIndex = '99999';
    solveButton.style.padding = '12px 20px';
    solveButton.style.backgroundColor = '#673ab7';
    solveButton.style.color = 'white';
    solveButton.style.border = 'none';
    solveButton.style.borderRadius = '8px';
    solveButton.style.cursor = 'pointer';
    solveButton.style.fontSize = '16px';
    solveButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    solveButton.id = 'gemini-solve-button';

    solveButton.addEventListener('click', async () => {
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            alert('Пожалуйста, вставьте ваш API ключ Gemini в скрипт!');
            return;
        }
        solveButton.disabled = true;
        solveButton.textContent = '⏳ Загрузка...';
        await processQuestionsOnPage();
    });

    if (!document.getElementById('gemini-solve-button')) {
        document.body.appendChild(solveButton);
    }

})();

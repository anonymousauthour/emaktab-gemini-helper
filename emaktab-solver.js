// Файл: emaktab-solver.js
// Поместите этот файл в ваш GitHub репозиторий

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    // Используем актуальную модель gemini-1.5-flash-latest
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    // Если gemini-1.5-flash-latest не сработает, можно попробовать gemini-1.5-pro-latest, но она может быть не везде доступна:
    // const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`;


    // --- Селекторы (на основе нашего анализа) ---
    const QUESTION_BLOCK_SELECTOR = '[data-test-id^="block-"]';
    const LEXICAL_EDITOR_SELECTOR = 'div[data-lexical-editor="true"]';
    const PARAGRAPH_SELECTOR = 'p';
    const TEXT_SPAN_SELECTOR = 'span[data-lexical-text="true"]:not(:empty)';

    const TABLE_SELECTOR_IN_BLOCK = 'table';
    const ANSWER_INPUT_SELECTOR = 'input[data-test-id^="answer-"]';

    const DECORATOR_SPAN_WITH_INPUT_SELECTOR_QUERY = `span[data-lexical-decorator="true"]:has(${ANSWER_INPUT_SELECTOR})`;
    const DECORATOR_SPAN_SELECTOR = 'span[data-lexical-decorator="true"]';

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    async function askGemini(fullPrompt) {
        console.log("Промпт для Gemini:", fullPrompt);
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    // generationConfig: { "temperature": 0.7, "maxOutputTokens": 1024 } // Можно настроить
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API Error:', response.status, errorData);
                const detailedError = errorData?.error?.message || JSON.stringify(errorData);
                return `ОШИБКА API ${response.status}: ${detailedError}`;
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {
                return data.candidates[0].content.parts[0].text.trim();
            } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                console.warn('Gemini API: Запрос заблокирован.', data.promptFeedback);
                return `ЗАПРОС ЗАБЛОКИРОВАН: ${data.promptFeedback.blockReason}`;
            } else {
                console.warn('Gemini API: Некорректный формат ответа.', data);
                return 'Нет ответа от Gemini';
            }
        } catch (error) {
            console.error('Ошибка при запросе к Gemini API:', error);
            return `Сетевая ошибка Gemini: ${error.message}`;
        }
    }

    function displayAnswer(questionBlockElement, geminiAnswer, answerInputsData = []) {
        const existingDisplay = questionBlockElement.querySelector('.gemini-answer-display');
        if (existingDisplay) {
            existingDisplay.remove();
        }

        const answerDisplay = document.createElement('div');
        answerDisplay.className = 'gemini-answer-display';
        answerDisplay.style.marginTop = '15px';
        answerDisplay.style.padding = '10px';
        answerDisplay.style.border = '1px dashed blue';
        answerDisplay.style.backgroundColor = '#f0f8ff';
        answerDisplay.style.whiteSpace = 'pre-wrap';
        answerDisplay.innerHTML = `<strong>🤖 Gemini:</strong><br>${geminiAnswer.replace(/\n/g, '<br>')}`;
        
        const lexicalEditor = questionBlockElement.querySelector(LEXICAL_EDITOR_SELECTOR);
        if (lexicalEditor) {
            lexicalEditor.insertAdjacentElement('afterend', answerDisplay);
        } else {
            questionBlockElement.appendChild(answerDisplay);
        }

        if (answerInputsData.length > 0 && geminiAnswer && !geminiAnswer.startsWith("ОШИБКА API") && !geminiAnswer.startsWith("ЗАПРОС ЗАБЛОКИРОВАН")) {
            const lines = geminiAnswer.split('\n');
            lines.forEach(line => {
                const match = line.match(/(?:answer-|INPUT\s+)([a-zA-Z0-9_-]+)\s*:\s*(.*)/i);
                if (match) {
                    const dataTestId = "answer-" + match[1].replace(/^answer-/i, '');
                    const valueToInsert = match[2].trim();
                    const inputElement = questionBlockElement.querySelector(`input[data-test-id="${dataTestId}"]`);
                    if (inputElement) {
                        console.log(`Попытка вставить "${valueToInsert}" в input[data-test-id="${dataTestId}"]`);
                        inputElement.value = valueToInsert;
                        inputElement.style.backgroundColor = 'lightyellow';
                         // Имитация события ввода, чтобы React мог среагировать (если нужно)
                        const event = new Event('input', { bubbles: true });
                        inputElement.dispatchEvent(event);
                    } else {
                        console.warn(`Не найден input для data-test-id="${dataTestId}" для вставки значения.`);
                    }
                }
            });
        }
    }

    function extractMainQuestionText(block) {
        const lexicalEditor = block.querySelector(LEXICAL_EDITOR_SELECTOR);
        if (!lexicalEditor) return "";

        let mainQuestionSegments = [];
        const paragraphs = lexicalEditor.querySelectorAll(PARAGRAPH_SELECTOR);

        for (const p of paragraphs) {
            if (p.querySelector(ANSWER_INPUT_SELECTOR) ||
                (p.innerText.trim().startsWith("Ответ:") && p.querySelector(DECORATOR_SPAN_SELECTOR)) ||
                (/^\d+\)/.test(p.innerText.trim()) && p.querySelector(DECORATOR_SPAN_SELECTOR))
               ) {
                break; 
            }
            const textSpans = p.querySelectorAll(TEXT_SPAN_SELECTOR);
            textSpans.forEach(span => mainQuestionSegments.push(span.innerText.trim()));
        }
        return mainQuestionSegments.join(" ").trim();
    }

    function buildPrompt(mainQuestionText, tableData, nonTableInputsData) {
        let prompt = `Проанализируй следующий вопрос и предоставь ответы.
Если это таблица, заполни ячейки, помеченные как [МЕСТО ДЛЯ ОТВЕТА] или [INPUT ...].
Если это список вопросов, дай ответ для каждого пункта.
Ответы давай в формате "answer-X: значение" или "метка_вопроса: значение", где X - номер из data-test-id.
Например:
answer-1: 15
answer-2: 3/40
Среднее значение: 25

Основной вопрос:
${mainQuestionText}
\n`;

        if (tableData && tableData.rows && tableData.rows.length > 0) {
            prompt += "\nТаблица для заполнения:\n";
            if (tableData.headers && tableData.headers.length > 0) {
                prompt += tableData.headers.join('\t|\t') + '\n';
                prompt += '-'.repeat(tableData.headers.join('\t|\t').length) + '\n';
            }
            
            tableData.rows.forEach((row, rowIndex) => {
                let rowStr = "";
                (tableData.headers || Object.keys(row)).forEach(header => { // Используем ключи row если заголовков нет
                    const cellContent = row[header]; 
                    if (cellContent) { 
                        if (cellContent.type === 'input') {
                            rowStr += `[INPUT ${cellContent.dataTestId || 'NO_ID'}]` + '\t|\t';
                        } else {
                            rowStr += (cellContent.value !== undefined ? cellContent.value : '(пусто)') + '\t|\t';
                        }
                    } else {
                        rowStr += '(нет данных по заголовку)' + '\t|\t'; 
                    }
                });
                prompt += rowStr.slice(0, -3) + '\n'; 
            });
        } else if (nonTableInputsData.length > 0) {
            prompt += "\nОтветь на следующие пункты:\n";
            nonTableInputsData.forEach(inputData => {
                prompt += `${inputData.context.trim()} [INPUT ${inputData.dataTestId}]\n`;
            });
        }
        return prompt;
    }

    async function processQuestionsOnPage() {
        const questionBlocks = document.querySelectorAll(QUESTION_BLOCK_SELECTOR);

        if (questionBlocks.length === 0) {
            console.log('eMaktab Solver: Блоки вопросов не найдены.');
            alert('Блоки вопросов не найдены. Проверьте селекторы в скрипте.');
            solveButton.textContent = '🔮 Решить с Gemini';
            solveButton.disabled = false;
            return;
        }

        console.log(`eMaktab Solver: Найдено блоков вопросов: ${questionBlocks.length}. Обработка...`);
        solveButton.textContent = `⏳ Обработка (0/${questionBlocks.length})...`;

        let questionCounter = 0;
        for (const block of questionBlocks) {
            questionCounter++;
            const blockId = block.getAttribute('data-test-id');
            console.log(`\n--- Обработка блока #${questionCounter} (data-test-id: ${blockId}) ---`);
            solveButton.textContent = `⏳ Обработка (${questionCounter}/${questionBlocks.length})...`;

            const mainQuestionText = extractMainQuestionText(block);
            
            const tableElement = block.querySelector(TABLE_SELECTOR_IN_BLOCK);
            const answerInputs = Array.from(block.querySelectorAll(ANSWER_INPUT_SELECTOR));
            let tableData = null;
            let nonTableInputsData = [];
            let allInputsForDisplay = [];

            if (!mainQuestionText && answerInputs.length === 0 && !tableElement) {
                console.log(`   Блок ${blockId} не содержит текста вопроса, таблиц или полей для ввода. Пропускаем.`);
                displayAnswer(block, "(Этот блок не содержит данных для Gemini)", []);
                if (questionCounter < questionBlocks.length) await new Promise(resolve => setTimeout(resolve, 50)); // Маленькая задержка
                continue;
            }
             if (!mainQuestionText && (answerInputs.length > 0 || tableElement)) {
                 console.warn(`   В блоке ${blockId} есть поля ввода/таблица, но не извлечен основной текст вопроса. Промпт может быть неполным.`);
            }


            if (tableElement) {
                console.log(`   Блок ${blockId} содержит таблицу.`);
                tableData = { headers: [], rows: [] };
                const rows = Array.from(tableElement.querySelectorAll('tr'));

                if (rows.length > 0) {
                    const headerRow = rows[0];
                    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
                    tableData.headers = headerCells.map(cell => (cell.innerText || "").trim()).filter(h => h);

                    if (tableData.headers.length === 0 && headerCells.length > 0) {
                        console.warn(`   ПРЕДУПРЕЖДЕНИЕ: Заголовки таблицы в блоке ${blockId} пусты. Используем 'Колонка X'.`);
                        tableData.headers = headerCells.map((_, i) => `Колонка ${i + 1}`);
                    }
                     if (tableData.headers.length === 0 && headerCells.length === 0 && rows.length > 1) {
                        console.warn(`   ПРЕДУПРЕЖДЕНИЕ: Нет тегов th/td в первой строке таблицы блока ${blockId}.`);
                    }

                    const dataRows = rows.slice(1);
                    dataRows.forEach(dataRow => {
                        const cells = Array.from(dataRow.querySelectorAll('td'));
                        const rowData = {};
                        let rowHasInput = false;
                        let rowHasData = false;

                        (tableData.headers.length > 0 ? tableData.headers : cells.map((_,i) => `Колонка ${i+1}`)).forEach((header, cellIndex) => { // Если нет заголовков, генерируем их
                            const cell = cells[cellIndex];
                            if (!cell) {
                                rowData[header] = { type: 'data', value: '(ячейка отсутствует)' };
                                return;
                            }
                            
                            const inputField = cell.querySelector(ANSWER_INPUT_SELECTOR);
                            if (inputField) {
                                rowHasInput = true;
                                const inputInfo = {
                                    type: 'input',
                                    dataTestId: inputField.getAttribute('data-test-id'),
                                    placeholder: inputField.getAttribute('placeholder')
                                };
                                rowData[header] = inputInfo;
                                allInputsForDisplay.push(inputInfo);
                            } else {
                                const cellText = (cell.innerText || "").trim();
                                rowData[header] = { type: 'data', value: cellText || '(пусто)' };
                                if (cellText && cellText !== '(пусто)') rowHasData = true;
                            }
                        });
                        if(rowHasInput || rowHasData) {
                            tableData.rows.push(rowData);
                        }
                    });
                }
                
                let tableHasInputs = tableData.rows.some(r => Object.values(r).some(cell => cell.type === 'input'));
                if (!tableHasInputs && answerInputs.length > 0 && !answerInputs.some(inp => tableElement.contains(inp))) {
                    console.log(`   Таблица в блоке ${blockId} не содержит полей ввода, но они есть вне таблицы.`);
                    tableData = null; 
                } else if (!tableHasInputs && answerInputs.length === 0) {
                     console.log(`   Таблица в блоке ${blockId} не содержит полей ввода. Информационная таблица.`);
                } else if (!tableHasInputs && answerInputs.length > 0 && answerInputs.every(inp => tableElement.contains(inp))) {
                    console.warn(`   ПРЕДУПРЕЖДЕНИЕ: Инпуты блока ${blockId} в таблице, но не определены как инпуты таблицы.`);
                }
            }
            
            if (!tableData && answerInputs.length > 0) {
                console.log(`   Блок ${blockId} обрабатывается как список полей ввода.`);
                const allParagraphsInLexical = Array.from(block.querySelectorAll(`${LEXICAL_EDITOR_SELECTOR} > ${PARAGRAPH_SELECTOR}`));
                
                answerInputs.forEach(inputEl => {
                    const dataTestId = inputEl.getAttribute('data-test-id');
                    let contextText = "";
                    const parentPWithInput = inputEl.closest(PARAGRAPH_SELECTOR);
                    let contextFoundForThisInput = false;

                    if (parentPWithInput) {
                        let pTextBeforeInput = "";
                        for (const childNode of parentPWithInput.childNodes) {
                            if (childNode.nodeType === Node.ELEMENT_NODE && childNode.matches(DECORATOR_SPAN_WITH_INPUT_SELECTOR_QUERY)) {
                                break;
                            }
                            if (childNode.textContent.trim()) {
                                pTextBeforeInput += childNode.textContent.trim() + " ";
                            }
                        }
                        if (pTextBeforeInput.trim()) {
                            contextText += `${pTextBeforeInput.trim()} `;
                            contextFoundForThisInput = true;
                        }

                        const indexOfParentP = allParagraphsInLexical.indexOf(parentPWithInput);
                        if (indexOfParentP > 0) {
                            for (let i = indexOfParentP - 1; i >= 0; i--) {
                                const prevP = allParagraphsInLexical[i];
                                if (prevP.querySelector(ANSWER_INPUT_SELECTOR) || !prevP.innerText.trim() || (mainQuestionText && mainQuestionText.includes(prevP.innerText.trim()))) {
                                     break; 
                                }
                                if (!prevP.querySelector(DECORATOR_SPAN_SELECTOR)) {
                                     contextText = `${prevP.innerText.trim()} ` + contextText;
                                     contextFoundForThisInput = true;
                                     break; 
                                }
                            }
                        }
                    }
                    nonTableInputsData.push({ dataTestId, context: contextText || "(нет явного контекста)" });
                    allInputsForDisplay.push({dataTestId, type: 'input'});
                });
            }

            if (!tableData && nonTableInputsData.length === 0 && answerInputs.length > 0) {
                 console.warn(`   Для блока ${blockId} не удалось извлечь контекст для полей ввода, но они есть. Используем только основной текст вопроса.`);
                 answerInputs.forEach(inputEl => {
                     allInputsForDisplay.push({dataTestId: inputEl.getAttribute('data-test-id'), type: 'input'});
                 });
            }

            if (!tableData && nonTableInputsData.length === 0 && answerInputs.length === 0) {
                console.log(`   Блок ${blockId} не содержит таблиц или полей для ввода, интересных для Gemini. Пропускаем.`);
                displayAnswer(block, "(Этот блок не содержит интерактивных элементов для решения)", []);
                if (questionCounter < questionBlocks.length) await new Promise(resolve => setTimeout(resolve, 50));
                continue;
            }

            const prompt = buildPrompt(mainQuestionText || "(Нет основного текста вопроса)", tableData, nonTableInputsData);
            const geminiAnswer = await askGemini(prompt);
            displayAnswer(block, geminiAnswer, allInputsForDisplay);

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
    // ... (стили кнопки остаются без изменений)
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

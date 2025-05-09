// Файл: emaktab-solver.js
// Поместите этот файл в ваш GitHub репозиторий

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${GEMINI_API_KEY}`; // !!!!!!!!!!!

    // --- Селекторы ---
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
        console.log("Промпт для Gemini (длина: " + fullPrompt.length + " символов):");
        // console.log("Полный промпт:", fullPrompt); // Раскомментируйте, если хотите видеть полный промпт всегда

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    // generationConfig можно будет добавить позже для тюнинга
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
                const geminiResponseText = data.candidates[0].content.parts[0].text.trim();
                console.log("Ответ от Gemini:", geminiResponseText);
                return geminiResponseText;
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
                // Этот regex ищет "answer-X: значение" или "метка: значение"
                // (?:answer-|INPUT\s+)? - опциональная группа для "answer-" или "INPUT "
                // ([a-zA-Z0-9_ -]+?) - захватывает метку/ключ (имя колонки, "Среднее значение" и т.д.)
                // \s*:\s* - двоеточие с пробелами вокруг
                // (.*) - захватывает значение
                const match = line.match(/(?:answer-|INPUT\s+)?([a-zA-Z0-9_ -À-ÿ]+?)\s*:\s*(.*)/i);
                if (match) {
                    let key = match[1].trim();
                    const valueToInsert = match[2].trim();
                    let inputElement;

                    // Пытаемся найти input по data-test-id, если ключ похож на answer-X или просто X
                    if (/^answer-\d+$/i.test(key) || /^\d+$/.test(key)) {
                        const numMatch = key.match(/\d+$/);
                        if (numMatch) {
                           inputElement = questionBlockElement.querySelector(`input[data-test-id="answer-${numMatch[0]}"]`);
                        }
                    }
                    
                    // Если не нашли по data-test-id, или ключ не похож на answer-X,
                    // пытаемся найти input, чей "контекст" (из answerInputsData) содержит ключ
                    // или для таблиц, если ключ - это имя колонки, а значение из первого столбца совпадает
                    if (!inputElement) {
                        const foundInputData = answerInputsData.find(inp => {
                            if (inp.context && inp.context.toLowerCase().includes(key.toLowerCase())) return true;
                            // Для таблиц: если ключ - это имя колонки, и первый столбец совпадает
                            if (inp.tableContext && inp.tableContext.header.toLowerCase() === key.toLowerCase()) return true; 
                            // Пробуем найти по dataTestId напрямую, если Gemini вернул только его (без "answer-")
                            if (inp.dataTestId && inp.dataTestId.toLowerCase() === key.toLowerCase()) return true;
                            return false;
                        });
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
                        // inputElement.dispatchEvent(new Event('blur', { bubbles: true }));

                        inputElement.style.backgroundColor = 'lightyellow';
                    } else {
                        console.warn(`Не найден input для ключа/метки "${key}" для вставки значения "${valueToInsert}".`);
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
        // Это версия промпта из "Попытки 7", которая была до "мега-промпта"
        let prompt = `ВАЖНО: Предоставляй ТОЛЬКО КОНЕЧНЫЕ ОТВЕТЫ на поставленные вопросы или для заполнения ячеек.
Не пиши объяснений, рассуждений или промежуточных шагов.
Если ответ - число, дай только число. Если дробь - дай дробь (например, 3/40).

Формат ответа для каждого поля ввода:
"answer-X: значение_ответа" (где X - номер из data-test-id)
ИЛИ "метка_вопроса: значение_ответа" (если метка более понятна).

Примеры формата:
answer-1: 28672
answer-2: 5880
W для x=5: 1/20 
n для x=6: 4

---
ЗАДАНИЕ:
Основной вопрос:
${mainQuestionText}
\n`;

        if (tableData && tableData.rows && tableData.rows.length > 0) {
            prompt += "\nТаблица для заполнения (предоставь значения для ячеек с [INPUT ...]):\n";
            if (tableData.headers && tableData.headers.length > 0) {
                prompt += tableData.headers.join('\t|\t') + '\n';
                prompt += '-'.repeat(tableData.headers.join('\t|\t').length) + '\n';
            }
            tableData.rows.forEach((row) => {
                let rowStr = "";
                (tableData.headers.length ? tableData.headers : Object.keys(row)).forEach(header => {
                    const cellContent = row[header]; 
                    if (cellContent) { 
                        if (cellContent.type === 'input') {
                            rowStr += `[INPUT ${cellContent.dataTestId || 'NO_ID'}]` + '\t|\t';
                        } else {
                            rowStr += (cellContent.value !== undefined ? cellContent.value : '') + '\t|\t';
                        }
                    } else {
                        rowStr += '' + '\t|\t'; 
                    }
                });
                prompt += rowStr.slice(0, -3) + '\n'; 
            });
        } else if (nonTableInputsData.length > 0) {
            prompt += "\nОтветь на следующие пункты (дай только конечный ответ для каждого [INPUT ...]):\n";
            nonTableInputsData.forEach(inputData => {
                prompt += `${inputData.context.trim()} [INPUT ${inputData.dataTestId}]\n`;
            });
        }
        prompt += "\nПОМНИ: ТОЛЬКО КОНЕЧНЫЕ ОТВЕТЫ.\n";
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
            let hasInteractiveElements = false;

            if (tableElement) {
                console.log(`   Блок ${blockId} содержит таблицу.`);
                tableData = { headers: [], rows: [] };
                const rows = Array.from(tableElement.querySelectorAll('tr'));
                if (rows.length > 0) {
                    const headerRow = rows[0];
                    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
                    tableData.headers = headerCells.map(cell => (cell.innerText || "").trim()).filter(h => h);
                    if (tableData.headers.length === 0 && headerCells.length > 0) {
                        tableData.headers = headerCells.map((_, i) => `Колонка ${i + 1}`);
                    }
                    const dataRows = rows.slice(1);
                    dataRows.forEach(dataRow => {
                        const cells = Array.from(dataRow.querySelectorAll('td'));
                        const rowData = {};
                        let rowHasInput = false;
                        let rowHasData = false;
                        const currentHeaders = tableData.headers.length ? tableData.headers : cells.map((_,i) => `Колонка ${i+1}`);
                        currentHeaders.forEach((header, cellIndex) => {
                            const cell = cells[cellIndex];
                            const firstColHeader = currentHeaders.length ? currentHeaders[0] : null;
                            const firstColValue = cellIndex === 0 ? (cell ? (cell.innerText || "").trim() : '(нет значения)') : (cells[0] ? (cells[0].innerText || "").trim() : '(нет значения)');

                            if (!cell) {
                                rowData[header] = { type: 'data', value: '(ячейка отсутствует)' }; return;
                            }
                            const inputField = cell.querySelector(ANSWER_INPUT_SELECTOR);
                            if (inputField) {
                                rowHasInput = true;
                                const inputInfo = { type: 'input', dataTestId: inputField.getAttribute('data-test-id'), placeholder: inputField.getAttribute('placeholder'),
                                                    tableContext: { header: header, firstColValue: firstColValue } }; // Добавляем контекст таблицы
                                rowData[header] = inputInfo;
                                allInputsForDisplay.push(inputInfo);
                            } else {
                                const cellText = (cell.innerText || "").trim();
                                rowData[header] = { type: 'data', value: cellText || '(пусто)' };
                                if (cellText && cellText !== '(пусто)') rowHasData = true;
                            }
                        });
                        if(rowHasInput || rowHasData) tableData.rows.push(rowData);
                    });
                }
                if (tableData.rows.some(r => Object.values(r).some(cell => cell.type === 'input'))) {
                    hasInteractiveElements = true;
                } else { tableData = null; } // Если в таблице нет инпутов, считаем ее не интерактивной для этого этапа
            }
            
            if (answerInputs.length > 0 && (!tableData || !answerInputs.every(inp => tableElement && tableElement.contains(inp)))) {
                console.log(`   Блок ${blockId} обрабатывается (или также обрабатывается) как список полей ввода.`);
                const allParagraphsInLexical = Array.from(block.querySelectorAll(`${LEXICAL_EDITOR_SELECTOR} > ${PARAGRAPH_SELECTOR}`));
                answerInputs.forEach(inputEl => {
                    if (allInputsForDisplay.some(d => d.dataTestId === inputEl.getAttribute('data-test-id'))) return; // Уже учли в таблице

                    const dataTestId = inputEl.getAttribute('data-test-id');
                    let contextText = "";
                    const parentPWithInput = inputEl.closest(PARAGRAPH_SELECTOR);
                    if (parentPWithInput) {
                        let pTextBeforeInput = "";
                        for (const childNode of parentPWithInput.childNodes) {
                            if (childNode.nodeType === Node.ELEMENT_NODE && childNode.matches(DECORATOR_SPAN_WITH_INPUT_SELECTOR_QUERY)) break;
                            if (childNode.textContent.trim()) pTextBeforeInput += childNode.textContent.trim() + " ";
                        }
                        if (pTextBeforeInput.trim()) contextText += `${pTextBeforeInput.trim()} `;
                        const indexOfParentP = allParagraphsInLexical.indexOf(parentPWithInput);
                        if (indexOfParentP > 0) {
                            for (let i = indexOfParentP - 1; i >= 0; i--) {
                                const prevP = allParagraphsInLexical[i];
                                if (prevP.querySelector(ANSWER_INPUT_SELECTOR) || !prevP.innerText.trim() || (mainQuestionText && mainQuestionText.includes(prevP.innerText.trim()))) break; 
                                if (!prevP.querySelector(DECORATOR_SPAN_SELECTOR)) { contextText = `${prevP.innerText.trim()} ` + contextText; break; }
                            }
                        }
                    }
                    nonTableInputsData.push({ dataTestId, context: contextText || "(нет явного контекста)" });
                    allInputsForDisplay.push({dataTestId, context: contextText || "(нет явного контекста)", type: 'input'});
                    hasInteractiveElements = true;
                });
            }
            
            if (!hasInteractiveElements) {
                console.log(`   Блок ${blockId} не содержит интерактивных элементов для решения Gemini. Пропускаем.`);
                displayAnswer(block, "(Этот блок не содержит интерактивных элементов для решения)", []);
                if (questionCounter < questionBlocks.length) await new Promise(resolve => setTimeout(resolve, 50));
                continue;
            }
            
            const currentMainQuestionText = mainQuestionText || "(Нет основного текста вопроса, но есть интерактивные элементы)";
            const prompt = buildPrompt(currentMainQuestionText, tableData, nonTableInputsData);
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

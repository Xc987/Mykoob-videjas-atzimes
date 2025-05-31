let currentSubjectGrades = null;

document.addEventListener('DOMContentLoaded', function() {
  browser.tabs.query({active: true, currentWindow: true}).then(function(tabs) {
    const currentTab = tabs[0];
    
    if (currentTab.url && currentTab.url.includes('https://family.mykoob.lv/?viewgrades/period')) {
      browser.tabs.executeScript(currentTab.id, {
        code: `(${extractGradesFromPage.toString()})()`
      }).then((results) => {
        const [gradesData] = results;
        if (!gradesData || !gradesData.subjectGrades) {
          document.getElementById('results').innerHTML = 
            '<p>Nav atzīmju dati.</p>';
          return;
        }
        currentSubjectGrades = gradesData.subjectGrades;
        displayResults();
      }).catch(error => {
        document.getElementById('results').innerHTML = 
          '<p>Error: ' + error.message + '</p>';
      });
    } else {
      document.getElementById('results').innerHTML = 
        '<p>Ejiet uz mykoob atzīmju sadaļu.</p>';
      document.getElementById('overall').textContent = '';
    }
  });
});

function extractGradesFromPage() {
  const VALID_STATUSES = new Set(['FV', 'PD', 'KD', 'NOD', 'OPB', 'PSD', 'MD', 'ISK', 'T', 'RD', 'DD', 'prm']);
  const html = document.documentElement.outerHTML;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const subjectDiv = doc.querySelector('div.period_subject_div');
  const subjects = [];
  if (subjectDiv) {
    const subjectRows = subjectDiv.querySelectorAll('tr');
    subjectRows.forEach(row => {
      const subjectCell = row.querySelector('td.col_1.nowrap') || row.querySelector('td.col_0.white');
      if (subjectCell) {
        const subject = subjectCell.textContent.trim();
        subjects.push(subject || "Empty");
      }
    });
  }
  const dataDiv = doc.querySelector('div.period_data_div');
  const subjectGrades = {};
  const subjectAverages = [];
  if (dataDiv) {
    const gradeRows = dataDiv.querySelectorAll('tr');
    for (let i = 0; i < Math.min(gradeRows.length, subjects.length); i++) {
      const gradeCells = gradeRows[i].querySelectorAll('td[class*="col_month_"]');
      const validGrades = [];
      gradeCells.forEach(cell => {
    const gradeSpans = cell.querySelectorAll('span.viewgrades_period_grade');
    gradeSpans.forEach(gradeSpan => {
        const hiddenTheme = gradeSpan.nextElementSibling;
        if (hiddenTheme && hiddenTheme.classList.contains('hide') && 
            hiddenTheme.classList.contains('_theme') && hiddenTheme.textContent) {
            try {
                const data = JSON.parse(hiddenTheme.textContent.replace(/\\\//g, '/'));
                if (data.length > 0 && data[0].length > 2 && VALID_STATUSES.has(data[0][2])) {
                    let grade = gradeSpan.textContent.trim();
                    if (grade.includes('%')) {
                        return;
                    }
                    if (grade.endsWith('`')) {
                        grade = grade.slice(0, -1);
                    }
                    const num = parseFloat(grade);
                    if (!isNaN(num)) {
                        validGrades.push(num);
                    }
                }
            } catch (e) {
                console.error('Error parsing grade data:', e);
            }
        }
    });
});
      if (validGrades.length > 0) {
        const rawAvg = validGrades.reduce((a, b) => a + b, 0) / validGrades.length;
        const roundedAvg = (rawAvg - Math.floor(rawAvg)) < 0.5 ? Math.floor(rawAvg) : Math.ceil(rawAvg);
        subjectAverages.push(rawAvg);
        subjectGrades[subjects[i]] = {
          grades: validGrades.map(g => Math.round(g)).join(', '),
          roundedAvg: roundedAvg,
          rawAvg: rawAvg
        };
      } else {
        subjectGrades[subjects[i]] = {
          grades: 'Nav',
          roundedAvg: null,
          rawAvg: null
        };
      }
    }
  }
  if (Object.keys(subjectGrades).length > 0) {
    const firstKey = Object.keys(subjectGrades)[0];
    delete subjectGrades[firstKey];
    if (subjectAverages.length > 0 && subjectAverages[0] !== null) {
      subjectAverages.shift();
    }
  }
  const overallAvg = subjectAverages.length > 0 ? 
    subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length : null;
  return {
    subjectGrades,
    overallAvg
  };
}

function displayResults() {
  const resultsDiv = document.getElementById('results');
  const overallDiv = document.getElementById('overall');
  
  if (!currentSubjectGrades || Object.keys(currentSubjectGrades).length === 0) {
    resultsDiv.innerHTML = '<p>Nav atzīmju dati.</p>';
    overallDiv.textContent = '';
    return;
  }
  
  let html = '';
  
  for (const [subject, data] of Object.entries(currentSubjectGrades)) {
    const roundedAvg = data.roundedAvg !== null ? roundToTwo(data.roundedAvg) : null;
    const rawAvg = data.rawAvg !== null ? roundToTwo(data.rawAvg) : null;
    const avgValue = rawAvg !== null ? rawAvg : 'null';
    
    html += `
      <div class="subject">
        <label>
          <input type="checkbox" class="subject-checkbox" checked 
                 data-avg="${avgValue}">
          ${subject}
        </label>
        <div class="grades">Atzīmes: ${data.grades}</div>
    `;
    if (roundedAvg !== null) {
    const singleDigitAvg = Math.round(data.rawAvg);
    html += `
      <div class="average">Vidējais: ${singleDigitAvg} (${rawAvg})</div>
    `;
  } else {
    html += `<div class="average">Vidējais: Nav</div>`;
  }
    html += `</div>`;
  }
  resultsDiv.innerHTML = html;
  document.querySelectorAll('.subject-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', recalculateAverage);
  });
  recalculateAverage();
}

function recalculateAverage() {
  const checkboxes = document.querySelectorAll('.subject-checkbox');
  let sum = 0;
  let count = 0;
  checkboxes.forEach(checkbox => {
    if (checkbox.checked) {
      const avg = parseFloat(checkbox.dataset.avg);
      if (!isNaN(avg) && isFinite(avg)) {
        const roundedSingleDigit = Math.round(avg);
        sum += roundedSingleDigit;
        count++;
      }
    }
  });
  
  const overallDiv = document.getElementById('overall');
  if (count > 0) {
    const overallAvg = sum / count;
    overallDiv.textContent = `Vidējais visos priekšmetos: ${overallAvg.toFixed(2)}`;
  } else {
    overallDiv.textContent = 'Izvēaties vismaz vienu priekšmetu';
  }
}

function roundToTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
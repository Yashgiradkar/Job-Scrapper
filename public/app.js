const state = {
  runId: undefined,
  pollTimer: undefined,
  results: [],
  filtered: [],
  page: 1,
  pageSize: 10,
  sortKey: 'matchPercentage',
  sortDirection: 'desc',
};

const elements = {
  form: document.querySelector('#searchForm'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  csvFile: document.querySelector('#csvFile'),
  roles: document.querySelector('#roles'),
  skills: document.querySelector('#skills'),
  locations: document.querySelector('#locations'),
  experience: document.querySelector('#experience'),
  minimumMatch: document.querySelector('#minimumMatch'),
  remote: document.querySelector('#remote'),
  logs: document.querySelector('#logs'),
  resultsBody: document.querySelector('#resultsBody'),
  tableSearch: document.querySelector('#tableSearch'),
  exportCsv: document.querySelector('#exportCsv'),
  exportExcel: document.querySelector('#exportExcel'),
  prevPage: document.querySelector('#prevPage'),
  nextPage: document.querySelector('#nextPage'),
  pageLabel: document.querySelector('#pageLabel'),
  modal: document.querySelector('#jobModal'),
  closeModal: document.querySelector('#closeModal'),
  modalTitle: document.querySelector('#modalTitle'),
  modalMeta: document.querySelector('#modalMeta'),
  modalScore: document.querySelector('#modalScore'),
  modalSkills: document.querySelector('#modalSkills'),
  modalDescription: document.querySelector('#modalDescription'),
  modalLink: document.querySelector('#modalLink'),
};

elements.startButton.addEventListener('click', () => void startRun());
elements.stopButton.addEventListener('click', () => void stopRun());
elements.tableSearch.addEventListener('input', renderResults);
elements.prevPage.addEventListener('click', () => {
  state.page = Math.max(1, state.page - 1);
  renderResults();
});
elements.nextPage.addEventListener('click', () => {
  state.page += 1;
  renderResults();
});
elements.exportCsv.addEventListener('click', () => download(`/match/runs/${state.runId}/export.csv`));
elements.exportExcel.addEventListener('click', () => download(`/match/runs/${state.runId}/export.xls`));
elements.closeModal.addEventListener('click', () => elements.modal.close());

document.querySelectorAll('th[data-sort]').forEach((header) => {
  header.addEventListener('click', () => {
    const key = header.dataset.sort;

    if (state.sortKey === key) {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDirection = key === 'matchPercentage' ? 'desc' : 'asc';
    }

    renderResults();
  });
});

async function startRun() {
  if (!elements.csvFile.files?.[0]) {
    alert('Choose a CSV containing company names and career page URLs.');
    return;
  }

  const csv = await elements.csvFile.files[0].text();
  const response = await fetch('/match/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      csv,
      criteria: {
        roles: splitList(elements.roles.value),
        skills: splitList(elements.skills.value),
        locations: splitList(elements.locations.value),
        experience: elements.experience.value || undefined,
        remote: elements.remote.checked ? true : undefined,
        minimumMatchPercentage: Number(elements.minimumMatch.value || 70),
      },
    }),
  });

  if (!response.ok) {
    alert(await response.text());
    return;
  }

  const run = await response.json();
  state.runId = run.id;
  state.results = [];
  state.page = 1;
  elements.startButton.disabled = true;
  elements.stopButton.disabled = false;
  elements.exportCsv.disabled = true;
  elements.exportExcel.disabled = true;
  await pollRun();
  state.pollTimer = window.setInterval(pollRun, 1500);
}

async function stopRun() {
  if (!state.runId) {
    return;
  }

  await fetch(`/match/runs/${state.runId}/stop`, { method: 'POST' });
  await pollRun();
}

async function pollRun() {
  if (!state.runId) {
    return;
  }

  const response = await fetch(`/match/runs/${state.runId}`);
  const run = await response.json();
  renderRun(run);

  if (['completed', 'failed', 'stopped'].includes(run.status)) {
    window.clearInterval(state.pollTimer);
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    elements.exportCsv.disabled = !run.result;
    elements.exportExcel.disabled = !run.result;
  }
}

function renderRun(run) {
  const result = run.result;
  elements.logs.textContent = (run.logs ?? []).join('\n') || `Status: ${run.status}`;

  setText('companiesProcessed', result?.companiesProcessed ?? 0);
  setText('jobsFound', result?.jobsFound ?? 0);
  setText('matchedJobs', result?.matchedJobs ?? 0);
  setText('successes', result?.successes ?? 0);
  setText('failures', result?.failures ?? 0);
  setText('durationMs', formatDuration(result?.durationMs ?? 0));

  state.results = result?.results ?? state.results;
  renderResults();
}

function renderResults() {
  const query = elements.tableSearch.value.toLowerCase();
  const multiplier = state.sortDirection === 'asc' ? 1 : -1;
  state.filtered = state.results
    .filter((job) => JSON.stringify(job).toLowerCase().includes(query))
    .sort((left, right) => {
      const leftValue = left[state.sortKey] ?? '';
      const rightValue = right[state.sortKey] ?? '';
      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * multiplier;
    });

  const maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.page = Math.min(state.page, maxPage);
  const rows = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

  elements.resultsBody.innerHTML = rows
    .map(
      (job, index) => `<tr data-index="${(state.page - 1) * state.pageSize + index}">
        <td>${escapeHtml(job.company)}</td>
        <td><button class="linklike" data-open="${(state.page - 1) * state.pageSize + index}">${escapeHtml(job.title)}</button></td>
        <td>${job.matchPercentage}%</td>
        <td>${escapeHtml(job.matchedSkills.join(', '))}</td>
        <td>${escapeHtml(job.location ?? '')}</td>
        <td><a href="${escapeHtml(job.jobUrl)}" target="_blank" rel="noreferrer">Open</a></td>
      </tr>`,
    )
    .join('');

  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openModal(state.filtered[Number(button.dataset.open)]));
  });

  elements.pageLabel.textContent = `Page ${state.page} of ${maxPage}`;
  elements.prevPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= maxPage;
}

function openModal(job) {
  elements.modalTitle.textContent = job.title;
  elements.modalMeta.textContent = `${job.company} · ${job.location ?? 'Location not listed'}`;
  elements.modalScore.textContent = `Overall ${job.matchPercentage}% · Role ${job.score.roleMatchPercentage}% · Skills ${job.score.technologyMatchPercentage}% · Experience ${job.score.experienceMatchPercentage}% · Location ${job.score.locationMatchPercentage}%`;
  elements.modalSkills.textContent = `Matched: ${job.matchedSkills.join(', ') || 'None'} | Missing: ${job.missingSkills.join(', ') || 'None'}`;
  elements.modalDescription.textContent = job.description ?? '';
  elements.modalLink.href = job.jobUrl;
  elements.modal.showModal();
}

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = String(value);
}

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function download(path) {
  window.location.href = path;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

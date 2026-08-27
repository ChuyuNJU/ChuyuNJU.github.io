(function () {
  "use strict";

  var MAX_FILE_SIZE = 20 * 1024 * 1024;
  var STANDARD_UPLOAD_LIMIT = 6 * 1024 * 1024;
  var BUCKET_DEFAULT = "achievement-files";
  var CATEGORY_LABELS = {
    award: "奖励",
    patent: "专利",
    software_copyright: "软件著作权"
  };
  var ALLOWED_FILES = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  var PUBLIC_FIELD_IDS = {
    awarding_body: "award-awarding-body",
    award_level: "award-level",
    award_grade: "award-grade",
    award_rank: "award-rank",
    certificate_no: "award-certificate-no",
    award_date: "award-date",
    award_recipients: "award-recipients",
    patent_type: "patent-type",
    patent_application_no: "patent-application-no",
    patent_no: "patent-no",
    patent_application_date: "patent-application-date",
    patent_grant_date: "patent-grant-date",
    patent_applicants: "patent-applicants",
    patent_inventors: "patent-inventors",
    software_registration_no: "software-registration-no",
    software_version: "software-version",
    software_completion_date: "software-completion-date",
    software_registration_date: "software-registration-date",
    software_copyright_owners: "software-copyright-owners",
    software_developers: "software-developers"
  };
  var SEARCH_FIELDS = [
    "title", "status", "awarding_body", "award_level", "award_grade",
    "award_rank", "certificate_no", "award_recipients", "patent_type",
    "patent_application_no", "patent_no", "patent_applicants",
    "patent_inventors", "software_registration_no", "software_version",
    "software_copyright_owners", "software_developers"
  ];

  var state = {
    client: null,
    config: null,
    records: [],
    privateById: new Map(),
    session: null,
    isAdmin: false,
    activeCategory: "all",
    previewUrl: null,
    authSubscription: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function clean(value) {
    var normalized = value === undefined || value === null ? "" : String(value).trim();
    return normalized || null;
  }

  function valueOf(id) {
    return clean(byId(id).value);
  }

  function setValue(id, value) {
    byId(id).value = value === undefined || value === null ? "" : value;
  }

  function isConfigReady(config) {
    if (!config || !config.supabaseUrl || !config.supabaseKey) return false;
    if (/YOUR_|PROJECT_REF/i.test(config.supabaseUrl + config.supabaseKey)) return false;
    try {
      return new URL(config.supabaseUrl).protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function showMessage(message, type) {
    var box = byId("achievements-message");
    box.textContent = message;
    box.className = "achievements-notice";
    if (type === "error") box.classList.add("achievements-notice--error");
    if (type === "warning") box.classList.add("achievements-notice--warning");
    box.hidden = false;
  }

  function clearMessage() {
    byId("achievements-message").hidden = true;
  }

  function showFormError(id, message) {
    var box = byId(id);
    box.textContent = message;
    box.hidden = false;
  }

  function clearFormError(id) {
    var box = byId(id);
    box.textContent = "";
    box.hidden = true;
  }

  function humanError(error) {
    var message = error && error.message ? error.message : String(error || "未知错误");
    var lower = message.toLowerCase();
    if (lower.indexOf("invalid login credentials") !== -1) return "邮箱或密码不正确。";
    if (lower.indexOf("email not confirmed") !== -1) return "邮箱尚未验证，请先完成邮箱确认。";
    if (lower.indexOf("failed to fetch") !== -1) return "网络连接失败，请检查网络后重试。";
    if (lower.indexOf("row-level security") !== -1 || lower.indexOf("permission denied") !== -1) {
      return "当前账号没有执行此操作的权限。";
    }
    return message;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value + "T00:00:00");
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function formatBytes(bytes) {
    var size = Number(bytes || 0);
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
    return (size / (1024 * 1024)).toFixed(1) + " MB";
  }

  function businessDate(record) {
    if (record.category === "award") return record.award_date || "";
    if (record.category === "patent") return record.patent_grant_date || record.patent_application_date || "";
    return record.software_registration_date || record.software_completion_date || "";
  }

  function getRecordDetails(record) {
    if (record.category === "award") {
      return [
        ["授奖单位", record.awarding_body],
        ["奖励级别", record.award_level],
        ["奖励等级", record.award_grade],
        ["完成人排名", record.award_rank],
        ["证书编号", record.certificate_no],
        ["获奖日期", formatDate(record.award_date)],
        ["获奖人员", record.award_recipients]
      ];
    }
    if (record.category === "patent") {
      return [
        ["专利类型", record.patent_type],
        ["申请号", record.patent_application_no],
        ["专利号", record.patent_no],
        ["申请日期", formatDate(record.patent_application_date)],
        ["授权日期", formatDate(record.patent_grant_date)],
        ["申请人", record.patent_applicants],
        ["发明人", record.patent_inventors]
      ];
    }
    return [
      ["登记号", record.software_registration_no],
      ["版本号", record.software_version],
      ["开发完成日期", formatDate(record.software_completion_date)],
      ["登记日期", formatDate(record.software_registration_date)],
      ["著作权人", record.software_copyright_owners],
      ["开发人员", record.software_developers]
    ];
  }

  function renderSession() {
    var loginButton = byId("achievements-login-button");
    var logoutButton = byId("achievements-logout-button");
    var newButton = byId("achievements-new-button");
    var label = byId("achievements-session-label");

    loginButton.hidden = Boolean(state.session);
    logoutButton.hidden = !state.session;
    newButton.hidden = !state.isAdmin;

    if (state.isAdmin) {
      label.textContent = "管理员：" + state.session.user.email;
    } else if (state.session) {
      label.textContent = "已登录，但无管理权限";
    } else {
      label.textContent = "公开浏览";
    }
  }

  function rebuildFilterOptions() {
    var currentYear = byId("achievements-year-filter").value;
    var currentStatus = byId("achievements-status-filter").value;
    var years = Array.from(new Set(state.records.map(function (record) {
      return String(record.year);
    }))).sort(function (a, b) { return Number(b) - Number(a); });
    var statuses = Array.from(new Set(state.records.map(function (record) {
      return clean(record.status);
    }).filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, "zh-CN"); });

    var yearSelect = byId("achievements-year-filter");
    var statusSelect = byId("achievements-status-filter");
    yearSelect.replaceChildren(new Option("全部年份", ""));
    statusSelect.replaceChildren(new Option("全部状态", ""));
    years.forEach(function (year) { yearSelect.add(new Option(year, year)); });
    statuses.forEach(function (status) { statusSelect.add(new Option(status, status)); });
    if (years.indexOf(currentYear) !== -1) yearSelect.value = currentYear;
    if (statuses.indexOf(currentStatus) !== -1) statusSelect.value = currentStatus;
  }

  function filteredRecords() {
    var keyword = byId("achievements-search").value.trim().toLocaleLowerCase("zh-CN");
    var year = byId("achievements-year-filter").value;
    var status = byId("achievements-status-filter").value;
    return state.records.filter(function (record) {
      if (state.activeCategory !== "all" && record.category !== state.activeCategory) return false;
      if (year && String(record.year) !== year) return false;
      if (status && record.status !== status) return false;
      if (keyword) {
        var haystack = SEARCH_FIELDS.map(function (field) {
          return record[field] || "";
        }).join(" ").toLocaleLowerCase("zh-CN");
        if (haystack.indexOf(keyword) === -1) return false;
      }
      return true;
    }).sort(function (left, right) {
      if (Number(left.year) !== Number(right.year)) return Number(right.year) - Number(left.year);
      var dateComparison = businessDate(right).localeCompare(businessDate(left));
      if (dateComparison) return dateComparison;
      return left.title.localeCompare(right.title, "zh-CN");
    });
  }

  function appendDetails(card, record) {
    var details = getRecordDetails(record).filter(function (item) { return Boolean(item[1]); });
    if (!details.length) return;
    var list = createElement("dl", "achievement-card__details");
    details.forEach(function (item) {
      var wrapper = createElement("div");
      wrapper.appendChild(createElement("dt", null, item[0]));
      wrapper.appendChild(createElement("dd", null, item[1]));
      list.appendChild(wrapper);
    });
    card.appendChild(list);
  }

  function button(text, className, handler) {
    var element = createElement("button", "achievements-button" + (className ? " " + className : ""), text);
    element.type = "button";
    element.addEventListener("click", handler);
    return element;
  }

  function renderPrivateSection(card, record) {
    var privateRecord = state.privateById.get(record.id) || null;
    if (!state.isAdmin) {
      var locked = createElement("div", "achievement-card__locked", "🔒 附件需管理员登录后查看");
      card.appendChild(locked);
      return;
    }

    var section = createElement("div", "achievement-card__private");
    section.appendChild(createElement("p", "achievement-card__private-title", "私密信息"));
    if (privateRecord && privateRecord.internal_note) {
      section.appendChild(createElement("p", "achievement-card__note", privateRecord.internal_note));
    }

    var fileRow = createElement("div", "achievement-card__file");
    if (privateRecord && privateRecord.file_path) {
      fileRow.appendChild(createElement("span", "achievement-card__file-name", privateRecord.original_filename || "附件"));
      fileRow.appendChild(createElement("span", null, formatBytes(privateRecord.file_size_bytes)));
      if (isPreviewable(privateRecord.file_mime_type)) {
        fileRow.appendChild(button("预览", "", function () { openAttachment(record, true); }));
      }
      fileRow.appendChild(button("下载", "", function () { openAttachment(record, false); }));
    } else {
      fileRow.appendChild(createElement("span", null, "暂无附件"));
    }
    section.appendChild(fileRow);
    card.appendChild(section);
  }

  function renderCard(record) {
    var card = createElement("article", "achievement-card");
    card.dataset.category = record.category;

    var header = createElement("div", "achievement-card__header");
    var titleWrap = createElement("div", "achievement-card__title-wrap");
    var badges = createElement("div", "achievement-card__badges");
    badges.appendChild(createElement("span", "achievement-badge", CATEGORY_LABELS[record.category] || record.category));
    badges.appendChild(createElement("span", "achievement-badge", record.year));
    if (record.status) badges.appendChild(createElement("span", "achievement-badge achievement-badge--status", record.status));
    titleWrap.appendChild(badges);
    titleWrap.appendChild(createElement("h3", "achievement-card__title", record.title));
    header.appendChild(titleWrap);

    if (state.isAdmin) {
      var actions = createElement("div", "achievement-card__actions");
      actions.appendChild(button("编辑", "", function () { openRecordDialog(record); }));
      actions.appendChild(button("永久删除", "achievements-button--danger", function () { deleteRecord(record); }));
      header.appendChild(actions);
    }
    card.appendChild(header);
    appendDetails(card, record);
    renderPrivateSection(card, record);
    return card;
  }

  function renderRecords() {
    var records = filteredRecords();
    var list = byId("achievements-list");
    list.replaceChildren();
    records.forEach(function (record) { list.appendChild(renderCard(record)); });
    byId("achievements-result-count").textContent = "共 " + records.length + " 条资料";
    byId("achievements-empty").hidden = records.length !== 0;
  }

  async function loadRecords() {
    byId("achievements-loading").hidden = false;
    var result = await state.client.from("achievement_records").select("*");
    byId("achievements-loading").hidden = true;
    if (result.error) {
      state.records = [];
      rebuildFilterOptions();
      renderRecords();
      showMessage("成果目录加载失败：" + humanError(result.error) + " 请确认已执行 Supabase 初始化脚本。", "error");
      return;
    }
    state.records = result.data || [];
    rebuildFilterOptions();
    renderRecords();
  }

  async function loadPrivateRecords() {
    state.privateById.clear();
    if (!state.isAdmin) return;
    var result = await state.client.from("achievement_private").select("*");
    if (result.error) throw result.error;
    (result.data || []).forEach(function (record) { state.privateById.set(record.record_id, record); });
  }

  async function applySession(session, authEvent) {
    state.session = session || null;
    state.isAdmin = false;
    state.privateById.clear();

    if (state.session) {
      var adminResult = await state.client.rpc("is_achievements_admin");
      state.isAdmin = !adminResult.error && adminResult.data === true;
      if (state.isAdmin) {
        try {
          await loadPrivateRecords();
        } catch (error) {
          showMessage("私密资料加载失败：" + humanError(error), "error");
        }
      } else if (authEvent === "SIGNED_IN") {
        showMessage("该账号不在成果档案管理员白名单中。", "error");
      }
    }

    renderSession();
    renderRecords();
    if (authEvent === "PASSWORD_RECOVERY") showDialog(byId("achievements-password-dialog"));
  }

  function updateCategoryForm() {
    var category = byId("achievement-category").value;
    document.querySelectorAll("[data-form-category]").forEach(function (fieldset) {
      fieldset.hidden = fieldset.dataset.formCategory !== category;
    });
  }

  function resetRecordForm() {
    byId("achievements-record-form").reset();
    setValue("achievement-id", "");
    setValue("achievement-year", new Date().getFullYear());
    byId("achievement-current-file").hidden = true;
    byId("achievement-remove-file-wrap").hidden = true;
    byId("achievement-upload-progress-wrap").hidden = true;
    clearFormError("achievements-record-error");
    updateCategoryForm();
  }

  function openRecordDialog(record) {
    if (!state.isAdmin) return;
    resetRecordForm();
    var privateRecord = record ? state.privateById.get(record.id) : null;
    byId("achievements-record-dialog-title").textContent = record ? "编辑资料" : "新增资料";
    if (record) {
      setValue("achievement-id", record.id);
      setValue("achievement-category", record.category);
      setValue("achievement-title", record.title);
      setValue("achievement-year", record.year);
      setValue("achievement-status", record.status);
      Object.keys(PUBLIC_FIELD_IDS).forEach(function (field) {
        setValue(PUBLIC_FIELD_IDS[field], record[field]);
      });
      setValue("achievement-internal-note", privateRecord && privateRecord.internal_note);
      if (privateRecord && privateRecord.file_path) {
        var fileBox = byId("achievement-current-file");
        fileBox.textContent = "当前附件：" + (privateRecord.original_filename || "附件") + "（" + formatBytes(privateRecord.file_size_bytes) + "）";
        fileBox.hidden = false;
        byId("achievement-remove-file-wrap").hidden = false;
      }
    }
    updateCategoryForm();
    showDialog(byId("achievements-record-dialog"));
  }

  function publicPayload() {
    var category = byId("achievement-category").value;
    var payload = {
      category: category,
      title: valueOf("achievement-title"),
      year: Number(byId("achievement-year").value),
      status: valueOf("achievement-status")
    };
    Object.keys(PUBLIC_FIELD_IDS).forEach(function (field) { payload[field] = null; });

    if (category === "award") {
      ["awarding_body", "award_level", "award_grade", "award_rank", "certificate_no", "award_date", "award_recipients"].forEach(function (field) {
        payload[field] = valueOf(PUBLIC_FIELD_IDS[field]);
      });
    } else if (category === "patent") {
      ["patent_type", "patent_application_no", "patent_no", "patent_application_date", "patent_grant_date", "patent_applicants", "patent_inventors"].forEach(function (field) {
        payload[field] = valueOf(PUBLIC_FIELD_IDS[field]);
      });
    } else {
      ["software_registration_no", "software_version", "software_completion_date", "software_registration_date", "software_copyright_owners", "software_developers"].forEach(function (field) {
        payload[field] = valueOf(PUBLIC_FIELD_IDS[field]);
      });
    }
    return payload;
  }

  function fileDescriptor(file) {
    if (!file) return null;
    var parts = file.name.toLowerCase().split(".");
    var extension = parts.length > 1 ? parts.pop() : "";
    var mime = ALLOWED_FILES[extension];
    if (!mime) throw new Error("不支持该附件格式。请选择 PDF、JPG、PNG、Word 或 Excel 文件。");
    if (file.size > MAX_FILE_SIZE) throw new Error("附件不能超过 20 MB。");
    if (file.size <= 0) throw new Error("附件内容为空。");
    return { extension: extension, mime: mime };
  }

  function setUploadProgress(percent, label) {
    byId("achievement-upload-progress-wrap").hidden = false;
    byId("achievement-upload-progress").value = Math.max(0, Math.min(100, percent));
    byId("achievement-upload-progress-label").textContent = label;
  }

  async function standardUpload(path, file, descriptor) {
    setUploadProgress(15, "正在上传…");
    var result = await state.client.storage.from(state.config.bucketName).upload(path, file, {
      cacheControl: "3600",
      contentType: descriptor.mime,
      upsert: false
    });
    if (result.error) throw result.error;
    setUploadProgress(100, "上传完成");
  }

  async function resumableUpload(path, file, descriptor) {
    if (!window.tus || !window.tus.Upload) throw new Error("断点续传组件加载失败，请刷新页面重试。");
    var sessionResult = await state.client.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;
    if (!session) throw new Error("登录状态已过期，请重新登录。");
    var projectRef = new URL(state.config.supabaseUrl).hostname.split(".")[0];
    var endpoint = "https://" + projectRef + ".storage.supabase.co/storage/v1/upload/resumable";

    await new Promise(function (resolve, reject) {
      var upload = new window.tus.Upload(file, {
        endpoint: endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: "Bearer " + session.access_token,
          apikey: state.config.supabaseKey
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: state.config.bucketName,
          objectName: path,
          contentType: descriptor.mime,
          cacheControl: "3600"
        },
        onError: reject,
        onProgress: function (uploaded, total) {
          var percent = total ? Math.round((uploaded / total) * 100) : 0;
          setUploadProgress(percent, "正在上传 " + percent + "%");
        },
        onSuccess: resolve
      });
      upload.findPreviousUploads().then(function (previousUploads) {
        if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      }).catch(reject);
    });
    setUploadProgress(100, "上传完成");
  }

  async function uploadAttachment(recordId, file) {
    var descriptor = fileDescriptor(file);
    var sessionResult = await state.client.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;
    if (!session) throw new Error("登录状态已过期，请重新登录。");
    var path = session.user.id + "/" + recordId + "/" + crypto.randomUUID() + "." + descriptor.extension;
    if (file.size > STANDARD_UPLOAD_LIMIT) await resumableUpload(path, file, descriptor);
    else await standardUpload(path, file, descriptor);
    return {
      file_path: path,
      original_filename: file.name,
      file_mime_type: descriptor.mime,
      file_size_bytes: file.size,
      file_uploaded_at: new Date().toISOString()
    };
  }

  async function removeStorageFile(path) {
    if (!path) return;
    var result = await state.client.storage.from(state.config.bucketName).remove([path]);
    if (result.error) throw result.error;
  }

  async function saveRecord(event) {
    event.preventDefault();
    clearFormError("achievements-record-error");
    if (!state.isAdmin) {
      showFormError("achievements-record-error", "当前登录状态没有管理权限。");
      return;
    }
    if (!event.currentTarget.reportValidity()) return;

    var file = byId("achievement-file").files[0] || null;
    try {
      if (file) fileDescriptor(file);
    } catch (error) {
      showFormError("achievements-record-error", humanError(error));
      return;
    }

    var submit = byId("achievements-record-submit");
    var existingId = valueOf("achievement-id");
    var recordId = existingId || crypto.randomUUID();
    var isNew = !existingId;
    var oldPrivate = state.privateById.get(recordId) || null;
    var payload = publicPayload();
    var note = valueOf("achievement-internal-note");
    submit.disabled = true;
    submit.textContent = "保存中…";
    clearMessage();

    try {
      var publicResult;
      if (isNew) {
        payload.id = recordId;
        publicResult = await state.client.from("achievement_records").insert(payload).select().single();
      } else {
        publicResult = await state.client.from("achievement_records").update(payload).eq("id", recordId).select().single();
      }
      if (publicResult.error) throw publicResult.error;
      setValue("achievement-id", recordId);

      var privateResult = await state.client.from("achievement_private").upsert({
        record_id: recordId,
        internal_note: note
      }, { onConflict: "record_id" }).select().single();
      if (privateResult.error) {
        if (isNew) await state.client.from("achievement_records").delete().eq("id", recordId);
        throw privateResult.error;
      }

      if (file) {
        var uploaded;
        try {
          uploaded = await uploadAttachment(recordId, file);
          var metadataResult = await state.client.from("achievement_private").update(uploaded).eq("record_id", recordId);
          if (metadataResult.error) {
            await removeStorageFile(uploaded.file_path);
            throw metadataResult.error;
          }
          if (oldPrivate && oldPrivate.file_path) {
            try {
              await removeStorageFile(oldPrivate.file_path);
            } catch (cleanupError) {
              showMessage("新附件已保存，但旧附件清理失败，请在 Supabase Storage 中检查：" + humanError(cleanupError), "warning");
            }
          }
        } catch (uploadError) {
          await loadRecords();
          await loadPrivateRecords();
          renderRecords();
          showFormError("achievements-record-error", "资料已保存，但附件上传失败：" + humanError(uploadError) + " 可以直接再次保存以重试附件。");
          return;
        }
      } else if (byId("achievement-remove-file").checked && oldPrivate && oldPrivate.file_path) {
        await removeStorageFile(oldPrivate.file_path);
        var clearFileResult = await state.client.from("achievement_private").update({
          file_path: null,
          original_filename: null,
          file_mime_type: null,
          file_size_bytes: null,
          file_uploaded_at: null
        }).eq("record_id", recordId);
        if (clearFileResult.error) throw clearFileResult.error;
      }

      await loadRecords();
      await loadPrivateRecords();
      renderRecords();
      closeDialog(byId("achievements-record-dialog"));
      showMessage(isNew ? "资料已新增。" : "资料已更新。", "success");
    } catch (error) {
      showFormError("achievements-record-error", humanError(error));
    } finally {
      submit.disabled = false;
      submit.textContent = "保存";
      byId("achievement-upload-progress-wrap").hidden = true;
    }
  }

  async function deleteRecord(record) {
    if (!state.isAdmin) return;
    if (!window.confirm("确定永久删除“" + record.title + "”吗？此操作无法恢复。")) return;
    clearMessage();
    var privateRecord = state.privateById.get(record.id) || null;

    try {
      if (privateRecord && privateRecord.file_path) await removeStorageFile(privateRecord.file_path);
      var result = await state.client.from("achievement_records").delete().eq("id", record.id);
      if (result.error) {
        if (privateRecord && privateRecord.file_path) {
          await state.client.from("achievement_private").update({
            file_path: null,
            original_filename: null,
            file_mime_type: null,
            file_size_bytes: null,
            file_uploaded_at: null
          }).eq("record_id", record.id);
        }
        throw result.error;
      }
      await loadRecords();
      await loadPrivateRecords();
      renderRecords();
      showMessage("资料已永久删除。", "success");
    } catch (error) {
      showMessage("删除失败：" + humanError(error), "error");
    }
  }

  function isPreviewable(mime) {
    return mime === "application/pdf" || Boolean(mime && mime.indexOf("image/") === 0);
  }

  function revokePreviewUrl() {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
    byId("achievements-preview-content").replaceChildren();
  }

  async function openAttachment(record, preview) {
    if (!state.isAdmin) return;
    var privateRecord = state.privateById.get(record.id);
    if (!privateRecord || !privateRecord.file_path) return;
    clearMessage();
    try {
      showMessage("正在读取附件…", "success");
      var result = await state.client.storage.from(state.config.bucketName).download(privateRecord.file_path);
      if (result.error) throw result.error;
      var url = URL.createObjectURL(result.data);
      if (!preview || !isPreviewable(privateRecord.file_mime_type)) {
        var link = document.createElement("a");
        link.href = url;
        link.download = privateRecord.original_filename || "attachment";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        showMessage("附件下载已开始。", "success");
        return;
      }

      revokePreviewUrl();
      state.previewUrl = url;
      byId("achievements-preview-title").textContent = privateRecord.original_filename || "附件预览";
      var content = byId("achievements-preview-content");
      if (privateRecord.file_mime_type === "application/pdf") {
        var frame = document.createElement("iframe");
        frame.src = url;
        frame.title = privateRecord.original_filename || "PDF 附件";
        content.appendChild(frame);
      } else {
        var image = document.createElement("img");
        image.src = url;
        image.alt = privateRecord.original_filename || "图片附件";
        content.appendChild(image);
      }
      byId("achievements-message").hidden = true;
      showDialog(byId("achievements-preview-dialog"));
    } catch (error) {
      showMessage("附件读取失败：" + humanError(error), "error");
    }
  }

  async function login(event) {
    event.preventDefault();
    clearFormError("achievements-login-error");
    var submit = byId("achievements-login-submit");
    submit.disabled = true;
    try {
      var result = await state.client.auth.signInWithPassword({
        email: byId("achievements-login-email").value.trim(),
        password: byId("achievements-login-password").value
      });
      if (result.error) throw result.error;
      await applySession(result.data.session, "SIGNED_IN");
      byId("achievements-login-password").value = "";
      closeDialog(byId("achievements-login-dialog"));
      if (state.isAdmin) showMessage("登录成功，已进入管理模式。", "success");
    } catch (error) {
      showFormError("achievements-login-error", humanError(error));
    } finally {
      submit.disabled = false;
    }
  }

  async function forgotPassword() {
    clearFormError("achievements-login-error");
    var email = byId("achievements-login-email").value.trim();
    if (!email) {
      showFormError("achievements-login-error", "请先填写账号邮箱。");
      return;
    }
    try {
      var redirectTo = window.location.origin + window.location.pathname;
      var result = await state.client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      if (result.error) throw result.error;
      closeDialog(byId("achievements-login-dialog"));
      showMessage("如果该邮箱已注册，密码重置邮件将很快发送。", "success");
    } catch (error) {
      showFormError("achievements-login-error", humanError(error));
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    clearFormError("achievements-password-error");
    var password = byId("achievements-new-password").value;
    var confirmation = byId("achievements-confirm-password").value;
    if (password !== confirmation) {
      showFormError("achievements-password-error", "两次输入的密码不一致。");
      return;
    }
    var submit = byId("achievements-password-submit");
    submit.disabled = true;
    try {
      var result = await state.client.auth.updateUser({ password: password });
      if (result.error) throw result.error;
      byId("achievements-password-form").reset();
      closeDialog(byId("achievements-password-dialog"));
      showMessage("密码已更新。", "success");
    } catch (error) {
      showFormError("achievements-password-error", humanError(error));
    } finally {
      submit.disabled = false;
    }
  }

  async function logout() {
    clearMessage();
    var result = await state.client.auth.signOut();
    if (result.error) {
      showMessage("退出登录失败：" + humanError(result.error), "error");
      return;
    }
    await applySession(null, "SIGNED_OUT");
    showMessage("已退出管理模式。", "success");
  }

  function clearFilters() {
    state.activeCategory = "all";
    document.querySelectorAll(".achievements-category-tab").forEach(function (tab) {
      var active = tab.dataset.category === "all";
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    byId("achievements-search").value = "";
    byId("achievements-year-filter").value = "";
    byId("achievements-status-filter").value = "";
    renderRecords();
  }

  function bindEvents() {
    byId("achievements-login-button").addEventListener("click", function () {
      clearFormError("achievements-login-error");
      showDialog(byId("achievements-login-dialog"));
    });
    byId("achievements-new-button").addEventListener("click", function () { openRecordDialog(null); });
    byId("achievements-logout-button").addEventListener("click", logout);
    byId("achievements-login-form").addEventListener("submit", login);
    byId("achievements-forgot-password").addEventListener("click", forgotPassword);
    byId("achievements-password-form").addEventListener("submit", updatePassword);
    byId("achievements-record-form").addEventListener("submit", saveRecord);
    byId("achievement-category").addEventListener("change", updateCategoryForm);
    byId("achievements-search").addEventListener("input", renderRecords);
    byId("achievements-year-filter").addEventListener("change", renderRecords);
    byId("achievements-status-filter").addEventListener("change", renderRecords);
    byId("achievements-clear-filters").addEventListener("click", clearFilters);
    byId("achievements-preview-dialog").addEventListener("close", revokePreviewUrl);

    document.querySelectorAll(".achievements-category-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.activeCategory = tab.dataset.category;
        document.querySelectorAll(".achievements-category-tab").forEach(function (candidate) {
          var active = candidate === tab;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        });
        renderRecords();
      });
    });

    document.querySelectorAll("[data-close-dialog]").forEach(function (closeButton) {
      closeButton.addEventListener("click", function () {
        var dialog = closeButton.closest("dialog");
        if (dialog) closeDialog(dialog);
      });
    });
  }

  async function initialize() {
    bindEvents();
    var rawConfig = window.ACHIEVEMENTS_CONFIG || {};
    state.config = {
      supabaseUrl: rawConfig.supabaseUrl,
      supabaseKey: rawConfig.supabaseKey,
      bucketName: rawConfig.bucketName || BUCKET_DEFAULT
    };
    var app = byId("achievements-app");

    if (!isConfigReady(state.config) || !window.supabase || !window.supabase.createClient) {
      byId("achievements-config-notice").hidden = false;
      byId("achievements-loading").hidden = true;
      byId("achievements-result-count").textContent = "尚未连接数据源";
      byId("achievements-login-button").disabled = true;
      app.setAttribute("aria-busy", "false");
      return;
    }

    state.client = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    var sessionResult = await state.client.auth.getSession();
    if (sessionResult.error) showMessage("登录状态读取失败：" + humanError(sessionResult.error), "error");
    await applySession(sessionResult.data && sessionResult.data.session, "INITIAL_SESSION");
    await loadRecords();

    var authListener = state.client.auth.onAuthStateChange(function (event, session) {
      window.setTimeout(function () {
        applySession(session, event).catch(function (error) {
          showMessage("登录状态更新失败：" + humanError(error), "error");
        });
      }, 0);
    });
    state.authSubscription = authListener.data.subscription;
    app.setAttribute("aria-busy", "false");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();

Page({
  data: {
    src: '',
    textResult: '',
    isLoading: false,
    
    modeIndex: 0,
    modes: [
      { name: '通用文字', type: 8 },
      { name: 'AI 手写智能纠错', type: 'ai' },
      { name: '身份证(正面)', type: 1 },
      { name: '银行卡', type: 2 },
      { name: '驾驶证', type: 4 },
      { name: '营业执照', type: 7 },
      { name: '行驶证', type: 3 }
    ]
  },

  onModeChange(e) {
    this.setData({ modeIndex: e.detail.value });
    if (this.data.src) {
        wx.showToast({ title: '模式已切换，请重新识别', icon: 'none' });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({ src: file.tempFilePath, textResult: '' });
        this.doOCR(file);
      }
    });
  },

  async doOCR(file) {
    const currentMode = this.data.modes[this.data.modeIndex];
    let filePath = file.tempFilePath;
    
    this.setData({ isLoading: true, textResult: '' });

    // ==========================================
    // 1. AI 模式 (走云函数，支持大图)
    // ==========================================
    if (currentMode.type === 'ai') {
      this.callAiOcr(filePath);
      return;
    }

    // ==========================================
    // 2. 微信原生 OCR (需严格控制体积 < 1MB)
    // ==========================================
    try {
      // 策略优化：只要超过 200KB 就进行压缩，确保万无一失
      // 微信 OCR 限制 Payload 为 1MB (Base64后约 1.3倍)，所以原图最好控制在 600KB 以内
      if (file.size > 200 * 1024) {
        wx.showLoading({ title: '压缩优化中...' });
        
        const imgInfo = await wx.getImageInfo({ src: filePath });
        const { width, height } = imgInfo;
        
        // 限制最大边长为 800px
        const MAX_SIDE = 800; 
        let targetW = width;
        let targetH = height;
             
        if (width > MAX_SIDE || height > MAX_SIDE) {
          const ratio = width / height;
          if (width > height) {
            targetW = MAX_SIDE;
            targetH = Math.round(MAX_SIDE / ratio);
          } else {
            targetH = MAX_SIDE;
            targetW = Math.round(MAX_SIDE * ratio);
          }
        }

        console.log(`执行压缩: ${width}x${height} -> ${targetW}x${targetH}`);

        const compressRes = await wx.compressImage({
          src: filePath,
          quality: 60, // 质量设为 60，平衡体积与清晰度
          compressedWidth: targetW,
          compressedHeight: targetH
        });
        filePath = compressRes.tempFilePath;
      }

      this.callWeChatOcrBase64(filePath, currentMode.type);

    } catch (e) {
      console.error('压缩异常:', e);
      // 如果压缩失败，尝试用原图（死马当活马医）
      this.callWeChatOcrBase64(filePath, currentMode.type);
    }
  },

  // Base64 直传核心逻辑
  callWeChatOcrBase64(filePath, ocrType) {
    wx.showLoading({ title: '识别中...' });
    
    const fs = wx.getFileSystemManager();
    // 增加 try-catch 防止 readFile 报错
    try {
      fs.readFile({
        filePath: filePath,
        encoding: 'base64',
        success: (res) => {
          const base64Data = res.data;
          console.log('Base64 Length:', base64Data.length);

          wx.serviceMarket.invokeService({
            service: 'wx79ac3de8be320b71',
            api: 'OcrAllInOne',
            data: {
              img_data: base64Data,
              data_type: 2,
              ocr_type: ocrType
            },
          }).then(res => {
            wx.hideLoading();
            const formattedText = this.parseResult(res.data, ocrType);
            if (!formattedText) {
               wx.showToast({ title: '无有效内容', icon: 'none' });
            } else {
               this.setData({ textResult: formattedText });
            }
          }).catch(err => {
            wx.hideLoading();
            console.error('OCR Fail:', err);
            let msg = '识别失败';
            if (err.errMsg && err.errMsg.includes('data exceed max size')) {
               msg = '图片依然过大，请切换到【AI模式】或裁剪图片';
            } else if (err.errMsg && err.errMsg.includes('auth deny')) {
               msg = '请在小程序后台开通 OCR 服务';
            }
            this.showError('提示', msg);
          }).finally(() => {
            this.setData({ isLoading: false });
          });
        },
        fail: (err) => {
          wx.hideLoading();
          this.setData({ isLoading: false });
          this.showError('文件错误', '无法读取图片数据');
        }
      });
    } catch (error) {
       wx.hideLoading();
       this.setData({ isLoading: false });
       this.showError('错误', '文件读取异常');
    }
  },

  // AI 模式逻辑 (保持不变)
  async callAiOcr(filePath) {
    try {
      wx.showLoading({ title: 'AI 思考中...' });
      const cloudPath = `ocr_temp/ai_${Date.now()}.png`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
      });
      const res = await wx.cloud.callFunction({
        name: 'aiOcr',
        data: { fileID: uploadRes.fileID }
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        this.setData({ textResult: res.result.text });
      } else {
        throw new Error(res.result?.error || '云端返回异常');
      }
    } catch (err) {
      wx.hideLoading();
      this.showError('AI 识别失败', err.message);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  showError(title, content) {
    wx.showModal({ title, content, showCancel: false });
  },

  parseResult(data, type) {
    if (!data) return '';
    let result = [];
    try {
      switch (type) {
        case 1: // 身份证
          if (data.idcard_res) {
            const info = data.idcard_res;
            if (info.type === 0) { 
              result.push(`姓名：${info.name.text}`);
              result.push(`性别：${info.gender.text}`);
              result.push(`民族：${info.nationality.text}`);
              result.push(`身份证号：${info.id.text}`);
              result.push(`住址：${info.address.text}`);
            } else { 
              result.push(`有效期：${info.valid_date.text}`);
            }
          }
          break;
        case 2: // 银行卡
          if (data.bankcard_res) result.push(`卡号：${data.bankcard_res.number.text}`);
          break;
        case 4: // 驾驶证
          if (data.driving_license_res) {
            const dl = data.driving_license_res;
            result.push(`证号：${dl.id_num.text}`);
            result.push(`姓名：${dl.name.text}`);
            result.push(`日期：${dl.valid_from.text} - ${dl.valid_to.text}`);
          }
          break;
        case 7: // 营业执照
          if (data.biz_license_res) {
             const bl = data.biz_license_res;
             result.push(`名称：${bl.enterprise_name.text}`);
             result.push(`注册号：${bl.reg_num.text}`);
          }
          break;
        case 3: // 行驶证
            if (data.driving_res) {
                const dr = data.driving_res;
                result.push(`车牌：${dr.plate_num.text}`);
                result.push(`所有人：${dr.owner.text}`);
            }
            break;
        case 8: // 通用文字
        default:
          if (data.ocr_comm_res && data.ocr_comm_res.items) {
            result = data.ocr_comm_res.items.map(item => item.text);
          }
          break;
      }
    } catch (e) { return '解析出错'; }
    if (result.length === 0) return '识别成功，未提取到关键信息';
    return result.join('\n');
  },

  copyText() {
    if(!this.data.textResult) return;
    wx.setClipboardData({ data: this.data.textResult });
  }
});
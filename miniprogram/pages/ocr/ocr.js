Page({
  data: {
    src: '',
    textResult: '',
    isLoading: false,
    
    // OCR 模式配置
    modeIndex: 0,
    modes: [
      { name: '通用文字', type: 8 },
      { name: '身份证(正面)', type: 1 }, // type 1 同时也支持背面，接口会自动判断，但这里主要引导用户
      { name: '银行卡', type: 2 },
      { name: '驾驶证', type: 4 },
      { name: '营业执照', type: 7 },
      { name: '行驶证', type: 3 }
    ]
  },

  // 模式切换
  onModeChange(e) {
    this.setData({ modeIndex: e.detail.value });
    // 如果已经有图片，切换模式后提示用户重新识别
    if (this.data.src) {
        wx.showToast({ title: '模式已切换，请重新点击识别', icon: 'none' });
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        this.setData({ src: res.tempFiles[0].tempFilePath, textResult: '' });
        this.doOCR(res.tempFiles[0].tempFilePath);
      }
    });
  },

  doOCR(filePath) {
    const currentMode = this.data.modes[this.data.modeIndex];
    this.setData({ isLoading: true });
    
    wx.serviceMarket.invokeService({
      service: 'wx79ac3de8be320b71', 
      api: 'OcrAllInOne',
      data: {
        img_url: new wx.serviceMarket.CDN({
            type: 'filePath',
            filePath: filePath,
        }),
        data_type: 3,
        ocr_type: currentMode.type // 动态传入类型
      },
    }).then(res => {
      console.log('OCR调用成功:', res);
      this.setData({ isLoading: false });
      
      const formattedText = this.parseResult(res.data, currentMode.type);
      
      if (!formattedText) {
         wx.showToast({ title: '未能识别有效内容', icon: 'none' });
      } else {
         this.setData({ textResult: formattedText });
      }

    }).catch(err => {
      console.error('OCR调用失败:', err);
      this.setData({ isLoading: false });
      let errorMsg = err.errMsg || '未知错误';
      if (err.errMsg && err.errMsg.includes('auth deny')) errorMsg = '未添加服务或无权限';
      
      wx.showModal({
        title: '识别失败',
        content: `请确认图片符合所选模式要求。\n错误: ${errorMsg}`,
        showCancel: false
      });
    });
  },

  // 核心：根据不同类型格式化输出结果
  parseResult(data, type) {
    if (!data) return '';
    let result = [];

    try {
      switch (type) {
        case 1: // 身份证
          if (data.idcard_res) {
            const info = data.idcard_res;
            if (info.type === 0) { // 正面
              result.push(`姓名：${info.name.text}`);
              result.push(`性别：${info.gender.text}`);
              result.push(`民族：${info.nationality.text}`);
              result.push(`出生：${info.birth.text}`); // 注意：部分接口返回 birth 字段
              result.push(`住址：${info.address.text}`);
              result.push(`身份证号：${info.id.text}`);
            } else { // 背面
              result.push(`有效期：${info.valid_date.text}`);
            }
          }
          break;

        case 2: // 银行卡
          if (data.bankcard_res) {
            result.push(`卡号：${data.bankcard_res.number.text}`);
            // 部分银行卡可能返回 bank_name 等，视API版本而定，这里取核心卡号
          }
          break;

        case 4: // 驾驶证
          if (data.driving_license_res) {
            const dl = data.driving_license_res;
            result.push(`证号：${dl.id_num.text}`);
            result.push(`姓名：${dl.name.text}`);
            result.push(`性别：${dl.sex.text}`);
            result.push(`国籍：${dl.nationality.text}`);
            result.push(`住址：${dl.address.text}`);
            result.push(`出生日期：${dl.birth_date.text}`);
            result.push(`初次领证：${dl.issue_date.text}`);
            result.push(`准驾车型：${dl.car_class.text}`);
            result.push(`有效期限：${dl.valid_from.text} 至 ${dl.valid_to.text}`);
          }
          break;
        
        case 7: // 营业执照
          if (data.biz_license_res) {
             const bl = data.biz_license_res;
             result.push(`注册号：${bl.reg_num.text}`);
             result.push(`名称：${bl.enterprise_name.text}`);
             result.push(`类型：${bl.type_of_enterprise.text}`);
             result.push(`法定代表人：${bl.legal_representative.text}`);
             result.push(`地址：${bl.address.text}`);
             result.push(`经营范围：${bl.business_scope.text}`);
          }
          break;
        
        case 3: // 行驶证
            if (data.driving_res) {
                const dr = data.driving_res;
                result.push(`车牌号：${dr.plate_num.text}`);
                result.push(`车辆类型：${dr.vehicle_type.text}`);
                result.push(`所有人：${dr.owner.text}`);
                result.push(`住址：${dr.addr.text}`);
                result.push(`品牌型号：${dr.model.text}`);
                result.push(`车辆识别代码：${dr.vin.text}`);
                result.push(`发动机号：${dr.engine_num.text}`);
            }
            break;

        case 8: // 通用
        default:
          if (data.ocr_comm_res && data.ocr_comm_res.items) {
            result = data.ocr_comm_res.items.map(item => item.text);
          }
          break;
      }
    } catch (e) {
      console.error('解析数据出错', e);
      return '解析数据格式出错，请重试';
    }

    return result.join('\n');
  },

  copyText() {
    if(!this.data.textResult) return;
    wx.setClipboardData({ data: this.data.textResult });
  }
});
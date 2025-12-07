// ⬇️⬇️⬇️ 请在这里填入你从百度AI平台获取的密钥 ⬇️⬇️⬇️
const BAIDU_AK = 'e892AkrmOduHty57cPQE76dw'; 
const BAIDU_SK = '53bINm1ddq90QlgUt73YPWw7Cjp5PQvq'; 

Page({
  data: {
    originalImage: '', 
    currentImage: '',  
    resultImage: '',   
    transparentImage: '', 
    selectedColor: 'blue', 
    processing: false,
    
    // 画布尺寸
    canvasWidth: 295, 
    canvasHeight: 413,
    // 预览框尺寸
    previewWidth: 300,
    previewHeight: 420,

    // 尺寸列表 (标准像素尺寸)
    // 1寸 = 295x413 px (300dpi)
    sizeList: [
      { name: '1寸', width: 295, height: 413, desc: '标准证件/简历' },
      { name: '小2寸', width: 390, height: 567, desc: '护照/部分签证' }, 
      { name: '2寸', width: 413, height: 626, desc: '标准大图' },
      { name: '小1寸', width: 260, height: 378, desc: '驾照/社保' },    
      { name: '大1寸', width: 390, height: 567, desc: '学历证书' },     
      { name: '五寸', width: 1050, height: 1499, desc: '生活照' },
      { name: '教师资格', width: 295, height: 413, desc: '专有规格' },
      { name: '计算机考', width: 144, height: 192, desc: '考试专用' },
      { name: '原图', width: 0, height: 0, desc: '不裁剪' }
    ],
    selectedSize: { name: '1寸', width: 295, height: 413 }
  },

  colorMap: {
    red: '#d9001b',
    blue: '#438edb',
    white: '#ffffff',
    gray: '#f2f2f2'
  },

  onLoad() {
    this.updatePreviewBox();
  },

  updatePreviewBox() {
    const { width, height } = this.data.selectedSize;
    if (width === 0) {
      this.setData({ previewWidth: 500, previewHeight: 600 });
    } else {
      const ratio = width / height;
      this.setData({
        previewHeight: 500,
        previewWidth: 500 * ratio
      });
    }
  },

  changeSize(e) {
    const index = e.currentTarget.dataset.index;
    const newSize = this.data.sizeList[index];
    
    this.setData({ selectedSize: newSize }, () => {
      this.updatePreviewBox();
      if (this.data.transparentImage) {
        this.combineImage(this.data.transparentImage);
      }
    });
  },

  changeColor(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ selectedColor: color });
    if (this.data.transparentImage) {
      this.combineImage(this.data.transparentImage);
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'front',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          originalImage: tempFilePath,
          currentImage: tempFilePath,
          resultImage: '',
          transparentImage: ''
        });
      }
    });
  },

  processImage() {
    if (!this.data.originalImage) return;
    this.setData({ processing: true });
    wx.showLoading({ title: 'AI 制作中...', mask: true });

    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: this.data.originalImage,
      encoding: 'base64',
      success: (res) => {
        this.getBaiduToken(res.data);
      },
      fail: (err) => this.handleError('读取图片失败')
    });
  },

  getBaiduToken(base64Img) {
    wx.request({
      url: `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_AK}&client_secret=${BAIDU_SK}`,
      method: 'POST',
      success: (res) => {
        if (res.data.access_token) {
          this.callBaiduSeg(res.data.access_token, base64Img);
        } else {
          this.handleError('Token获取失败，请检查API Key');
        }
      },
      fail: () => this.handleError('网络错误')
    });
  },

  callBaiduSeg(token, base64Img) {
    wx.request({
      url: `https://aip.baidubce.com/rest/2.0/image-classify/v1/body_seg?access_token=${token}`,
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: { image: base64Img, type: 'foreground' },
      success: (res) => {
        if (res.data.foreground) {
          this.saveBase64ToLocal(res.data.foreground);
        } else {
          this.handleError('抠图失败: ' + (res.data.error_msg || '未知'));
        }
      },
      fail: () => this.handleError('请求失败')
    });
  },

  saveBase64ToLocal(base64Str) {
    const fs = wx.getFileSystemManager();
    const tempFilePath = `${wx.env.USER_DATA_PATH}/baidu_result_${Date.now()}.png`;
    fs.writeFile({
      filePath: tempFilePath,
      data: wx.base64ToArrayBuffer(base64Str),
      encoding: 'binary',
      success: () => {
        this.setData({ transparentImage: tempFilePath });
        this.combineImage(tempFilePath);
      },
      fail: (err) => this.handleError('文件保存失败')
    });
  },

  combineImage(transparentPath) {
    wx.showLoading({ title: '智能合成...' });
    
    let targetW, targetH;
    
    // 使用离屏 Canvas 获取图片信息
    const offscreenCanvas = wx.createOffscreenCanvas({type: '2d'});
    const imgForCalc = offscreenCanvas.createImage();
    imgForCalc.src = transparentPath;
    
    imgForCalc.onload = () => {
      const imgW = imgForCalc.width;
      const imgH = imgForCalc.height;

      if (this.data.selectedSize.width === 0) {
        // 原图模式
        targetW = imgW;
        targetH = imgH;
      } else {
        // 证件照模式：严格使用标准尺寸
        targetW = this.data.selectedSize.width;
        targetH = this.data.selectedSize.height;
      }

      // 1. 设置 WXML Canvas 样式尺寸
      this.setData({
        canvasWidth: targetW,
        canvasHeight: targetH
      }, () => {
        // 2. 延时确保视图更新
        setTimeout(() => {
          // 直接传入目标尺寸，不再进行缩放，确保尺寸 1:1 匹配
          this.startRealDrawing(transparentPath, targetW, targetH);
        }, 200);
      });
    };
    
    imgForCalc.onerror = () => this.handleError('图片加载错误');
  },

  // 真正的绘图逻辑
  startRealDrawing(transparentPath, targetW, targetH) {
    const query = wx.createSelectorQuery();
    query.select('#photoCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) return;

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 3. 【关键】严格将 Canvas 像素尺寸设置为目标尺寸
        // 之前这里放大了3倍，导致如果不手动缩小，尺寸就是3倍大
        // 现在恢复为 1:1，保证导出尺寸绝对正确
        canvas.width = targetW;
        canvas.height = targetH;

        // 开启高质量图像平滑，尽可能保证缩放清晰
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const img = canvas.createImage();
        img.src = transparentPath;

        img.onload = () => {
          // 清空画布
          ctx.clearRect(0, 0, targetW, targetH);

          // 1. 原图模式
          if (this.data.selectedSize.width === 0) {
             ctx.fillStyle = this.colorMap[this.data.selectedColor] || '#438edb';
             ctx.fillRect(0, 0, targetW, targetH);
             ctx.drawImage(img, 0, 0, targetW, targetH);
             this.exportImage(canvas, targetW, targetH);
             return;
          }

          // 2. 智能裁剪模式
          this.drawSmartLayout(canvas, ctx, img, targetW, targetH);
        };
      });
  },

  drawSmartLayout(canvas, ctx, img, targetW, targetH) {
    const imgW = img.width;
    const imgH = img.height;

    // 计算布局 (Cover模式)
    const scale = Math.max(targetW / imgW, targetH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const dx = (targetW - drawW) / 2; // 水平居中

    // 预扫描头顶位置
    // 简单绘制一次用于取色
    ctx.drawImage(img, dx, 0, drawW, drawH);

    const centerX = Math.floor(targetW / 2);
    const scanHeight = Math.floor(targetH * 0.6); 
    let topPixelY = 0;
    
    try {
      const imageData = ctx.getImageData(centerX, 0, 1, scanHeight).data;
      for (let y = 0; y < scanHeight; y++) {
        if (imageData[y * 4 + 3] > 50) { 
          topPixelY = y;
          break;
        }
      }
    } catch (e) {
      console.log('读取像素失败', e);
    }

    // 理想头顶位置 (12% 处)
    const IDEAL_TOP = targetH * 0.12; 
    let finalDy = 0;

    if (topPixelY > 0) {
      const diff = topPixelY - IDEAL_TOP;
      finalDy = -diff;
    }

    // 边界限制
    const maxUpShift = -(drawH - targetH); 
    if (finalDy < maxUpShift) finalDy = maxUpShift;
    if (finalDy > 0) finalDy = 0;

    // 正式绘制
    ctx.clearRect(0, 0, targetW, targetH);
    // 填充背景色
    ctx.fillStyle = this.colorMap[this.data.selectedColor] || '#438edb';
    ctx.fillRect(0, 0, targetW, targetH);
    
    // 绘制人像
    ctx.drawImage(img, dx, finalDy, drawW, drawH);

    this.exportImage(canvas, targetW, targetH);
  },

  exportImage(canvas, w, h) {
    setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas: canvas,
          width: w,      // 裁剪源宽度 (等于画布宽)
          height: h,     // 裁剪源高度 (等于画布高)
          destWidth: w,  // 导出目标宽度 (严格匹配)
          destHeight: h, // 导出目标高度 (严格匹配)
          fileType: 'png',
          quality: 1.0,
          success: (fileRes) => {
            console.log(`导出完成: ${w}x${h}`);
            this.setData({
              resultImage: fileRes.tempFilePath,
              currentImage: fileRes.tempFilePath,
              processing: false
            });
            wx.hideLoading();
          },
          fail: (err) => {
              console.error(err);
              this.handleError('导出失败');
          }
        });
    }, 100);
  },

  handleError(msg) {
    this.setData({ processing: false });
    wx.hideLoading();
    wx.showModal({ title: '提示', content: msg, showCancel: false });
  },

  saveImageToAlbum() {
    if (!this.data.resultImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => wx.showToast({ title: '已保存' }),
      fail: (err) => {
        if (err.errMsg.includes('auth')) {
          wx.showModal({ content: '请授权相册权限', success: (res) => { if(res.confirm) wx.openSetting() } });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  }
});
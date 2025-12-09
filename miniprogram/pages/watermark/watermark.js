Page({
  data: {
    src: '',
    text: '仅供办理入职使用', // 默认文案
    fontSize: 24,    // 字体大小
    opacity: 0.3,    //Hb
    color: '#000000',
    density: 3,      // 密度 1-5 (新增)
    angle: -30,      // 旋转角度 (新增)
    
    canvasW: 300,
    canvasH: 300,
    
    isProcessing: false,
    resultPath: ''
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        this.setData({ src: res.tempFiles[0].tempFilePath, resultPath: '' });
        this.drawWatermark();
      }
    });
  },

  onInput(e) { this.setData({ text: e.detail.value }); this.drawWatermark(); },
  
  // 【修复】修正变量名错误，并关联重绘
  onFontSize(e) { this.setData({ fontSize: e.detail.value }); this.drawWatermark(); },
  
  onOpacity(e) { this.setData({ opacity: e.detail.value }); this.drawWatermark(); },
  
  // 【新增】角度和密度控制
  onAngle(e) { this.setData({ angle: e.detail.value }); this.drawWatermark(); },
  onDensity(e) { this.setData({ density: e.detail.value }); this.drawWatermark(); },
  
  // 切换颜色
  toggleColor() {
    const newColor = this.data.color === '#000000' ? '#ffffff' : '#000000';
    this.setData({ color: newColor });
    this.drawWatermark();
  },

  drawWatermark() {
    if (!this.data.src) return;
    
    const query = wx.createSelectorQuery();
    query.select('#wmCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res[0]) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      
      const img = canvas.createImage();
      img.src = this.data.src;
      
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        
        // 设置画布大小
        canvas.width = w;
        canvas.height = h;
        
        // 1. 绘制原图
        ctx.globalAlpha = 1; 
        ctx.drawImage(img, 0, 0, w, h);
        
        // 2. 绘制水印
        // 【优化】动态字体大小：基准 * 系数
        const finalFontSize = w * (this.data.fontSize / 600); 
        ctx.font = `bold ${finalFontSize}px sans-serif`; 
        ctx.fillStyle = this.data.color;
        
        // 设置透明度
        ctx.globalAlpha = this.data.opacity;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        
        // 旋转角度
        const angle = this.data.angle * Math.PI / 180;
        
        // 【优化】根据密度计算间距
        // 密度越大(5)，间距系数越小
        const gapRatio = 1.0 - (this.data.density * 0.15); 
        const stepX = w * gapRatio; 
        const stepY = h * gapRatio * 0.8; 
        
        for (let x = -w; x < w * 2; x += stepX) {
          for (let y = -h; y < h * 2; y += stepY) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillText(this.data.text, 0, 0);
            ctx.restore();
          }
        }
      };
    });
  },

  save() {
    wx.showLoading({ title: '保存中' });
    const query = wx.createSelectorQuery();
    query.select('#wmCanvas').fields({ node: true }).exec((res) => {
      const canvas = res[0].node;
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'jpg',
        quality: 0.9,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => wx.showToast({ title: '已保存' }),
            complete: () => wx.hideLoading()
          });
        }
      });
    });
  }
});
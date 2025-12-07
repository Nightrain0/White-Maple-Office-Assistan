Page({
  data: {
    currentImage: '',
    imageInfo: {}, // { width, height, size, sizeStr }
    
    // 设置
    enableSizeLimit: false,
    targetSizeKB: '',
    
    enableResize: false,
    targetWidth: '',
    targetHeight: '',
    
    // 处理中
    processing: false,
    cWidth: 300, // 画布尺寸
    cHeight: 300,

    // 结果
    resultImage: '',
    resultInfo: {}
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({
          currentImage: file.tempFilePath,
          resultImage: '', // 清除上次结果
          imageInfo: {
            width: 0, 
            height: 0,
            size: file.size,
            sizeStr: this.formatSize(file.size)
          }
        });
        
        // 获取图片详细尺寸
        wx.getImageInfo({
          src: file.tempFilePath,
          success: (info) => {
            this.setData({
              'imageInfo.width': info.width,
              'imageInfo.height': info.height
            });
          }
        });
      }
    });
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
  },

  toggleSizeLimit(e) {
    this.setData({ enableSizeLimit: e.detail.value });
  },
  
  onSizeInput(e) {
    this.setData({ targetSizeKB: e.detail.value });
  },

  toggleResize(e) {
    this.setData({ enableResize: e.detail.value });
  },

  onWidthInput(e) {
    this.setData({ targetWidth: e.detail.value });
  },

  onHeightInput(e) {
    this.setData({ targetHeight: e.detail.value });
  },

  async startCompress() {
    if (!this.data.currentImage) return;
    this.setData({ processing: true });

    try {
      // 1. 计算初始目标尺寸
      let destW = this.data.imageInfo.width;
      let destH = this.data.imageInfo.height;

      if (this.data.enableResize) {
        const inputW = parseInt(this.data.targetWidth);
        const inputH = parseInt(this.data.targetHeight);

        if (inputW && inputH) {
          destW = inputW;
          destH = inputH;
        } else if (inputW && !inputH) {
          const ratio = this.data.imageInfo.height / this.data.imageInfo.width;
          destW = inputW;
          destH = Math.round(inputW * ratio);
        } else if (!inputW && inputH) {
          const ratio = this.data.imageInfo.width / this.data.imageInfo.height;
          destH = inputH;
          destW = Math.round(inputH * ratio);
        }
        this.setData({ targetWidth: destW, targetHeight: destH }); 
      }

      // 2. 初始化压缩流程
      // 先设置好画布容器大小，稍微延时确保生效
      this.setData({ cWidth: destW, cHeight: destH }, () => {
         setTimeout(() => {
           this.initCanvasAndCompress(destW, destH);
         }, 200);
      });

    } catch (err) {
      console.error(err);
      this.handleError('初始化失败');
    }
  },

  initCanvasAndCompress(w, h) {
    const query = wx.createSelectorQuery();
    query.select('#compressCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          this.handleError('画布初始化失败');
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const img = canvas.createImage();
        img.src = this.data.currentImage;

        img.onload = () => {
          // 3. 计算目标字节数 (预留 5% 缓冲，防止保存后溢出)
          let targetBytes = Infinity;
          if (this.data.enableSizeLimit && this.data.targetSizeKB) {
             // 例如用户填 200KB，我们内部按 190KB 压，保证万无一失
             targetBytes = parseInt(this.data.targetSizeKB) * 1024 * 0.95; 
          }

          // 开始递归压缩逻辑
          // 初始质量 0.9
          this.runCompressLogic(canvas, ctx, img, w, h, 0.9, targetBytes);
        };
        
        img.onerror = () => this.handleError('图片加载失败');
      });
  },

  /**
   * 核心压缩递归函数
   * 策略：优先降画质，画质降到底(0.1)如果还不行，就降分辨率(缩放)
   */
  runCompressLogic(canvas, ctx, img, w, h, quality, targetBytes) {
    // 1. 设置画布尺寸 & 绘制图片
    // 只有当尺寸发生变化时（递归回来时），才需要这一步，
    // 但为了逻辑简单，每次都重设一下并无大碍（Canvas API 内部会优化）
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    
    // 每次必须清空重绘
    ctx.clearRect(0, 0, w, h);
    // 开启高质量缩放，防止缩小后锯Mw严重
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    // 2. 导出尝试
    // 如果没有大小限制，或者是为了变高清（enableResize且目标很大），用 png
    // 如果是为了压缩体积，必须用 jpg
    const useJpg = (targetBytes !== Infinity);
    const fileType = useJpg ? 'jpg' : 'png';

    wx.canvasToTempFilePath({
      canvas: canvas,
      fileType: fileType,
      quality: quality, // 仅对 jpg 有效
      success: (res) => {
        // 如果不需要限制大小，直接完成
        if (targetBytes === Infinity) {
             this.finishCompress(res.tempFilePath, w, h);
             return;
        }

        // 检查大小
        wx.getFileInfo({
          filePath: res.tempFilePath,
          success: (fileInfo) => {
            const currentSize = fileInfo.size;
            console.log(`尝试: ${w}x${h}, 质量:${quality.toFixed(1)}, 大小:${this.formatSize(currentSize)}`);

            if (currentSize <= targetBytes) {
              // 【成功】满足大小
              this.finishCompress(res.tempFilePath, w, h, currentSize);
            } else {
              // 【失败】依然太大
              if (quality > 0.11) {
                // A计划：继续降低画质 (步进 0.1)
                // 只有只改画质时，不需要重新 drawImage，但为了代码统一，这里直接递归
                this.runCompressLogic(canvas, ctx, img, w, h, quality - 0.1, targetBytes);
              } else {
                // B计划：画质已经到底(0.1)了，只能缩小尺寸了
                // 每次缩小为原来的 90%
                const nextW = Math.floor(w * 0.9);
                const nextH = Math.floor(h * 0.9);
                
                // 防止缩得太小
                if (nextW < 50 || nextH < 50) {
                   // 实在压不下去了，就给最后这个结果吧
                   this.finishCompress(res.tempFilePath, w, h, currentSize);
                   return;
                }

                console.log(`画质已到底，执行尺寸缩放 -> ${nextW}x${nextH}`);
                // 重置画质为 0.8 (尺寸小了，画zi可以稍微回来点，不然太糊)
                this.runCompressLogic(canvas, ctx, img, nextW, nextH, 0.8, targetBytes);
              }
            }
          },
          fail: () => this.handleError('获取文件信息失败')
        });
      },
      fail: () => this.handleError('导出图片失败')
    });
  },

  finishCompress(path, w, h, size) {
    // 如果没传 size，再查一次（针对不限大小的情况）
    if (!size) {
        wx.getFileInfo({
            filePath: path,
            success: (res) => {
                this.showResult(path, res.size, w, h);
            }
        });
    } else {
        this.showResult(path, size, w, h);
    }
  },

  showResult(path, size, w, h) {
    this.setData({
      resultImage: path,
      processing: false,
      resultInfo: {
        width: w,
        height: h,
        size: size,
        sizeStr: this.formatSize(size)
      }
    });
  },

  closeResult() {
    this.setData({ resultImage: '' });
  },

  previewResult() {
    if(this.data.resultImage) {
      wx.previewImage({ urls: [this.data.resultImage] });
    }
  },

  saveImage() {
    if (!this.data.resultImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => wx.showToast({ title: '已保存' }),
      fail: (err) => {
        if(err.errMsg.includes('auth')) {
          wx.showModal({ content: '请授权相册权限', success: (res) => { if(res.confirm) wx.openSetting() }});
        }
      }
    });
  },

  handleError(msg) {
    this.setData({ processing: false });
    wx.showToast({ title: msg, icon: 'none' });
  }
});
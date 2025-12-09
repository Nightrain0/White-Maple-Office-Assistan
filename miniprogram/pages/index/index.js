Page({
  navTo(e) {
    const page = e.currentTarget.dataset.page;
    let url = '';
    
    switch (page) {
      case 'idphoto':
        url = '/pages/idphoto/idphoto';
        break;
      case 'compress':
        url = '/pages/compress/compress';
        break;
      case 'batch':
        url = '/pages/batch/batch';
        break;
      case 'watermark':
        url = '/pages/watermark/watermark';
        break;
      case 'stitch':
        url = '/pages/stitch/stitch';
        break;
      case 'ocr':
        url = '/pages/ocr/ocr';
        break;
    }

    if (url) {
      wx.navigateTo({ url });
    }
  }
});
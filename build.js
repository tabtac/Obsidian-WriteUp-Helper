#!/usr/bin/env node

/**
 * 构建脚本 - 用于打包Chrome扩展
 * 使用方法: node build.js
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 配置
const BUILD_DIR = 'dist';
const PACKAGE_NAME = 'obsidian-writeup-helper';

// 需要包含的文件
const INCLUDE_FILES = [
    'manifest.json',
    'content.js',
    'config.js',
    'styles.css',
    'icon16.png',
    'icon48.png',
    'icon128.png',
    'README.md',
    'LICENSE'
];

// 需要排除的文件和目录
const EXCLUDE_PATTERNS = [
    'node_modules',
    'dist',
    '.git',
    '.gitignore',
    'build.js',
    'test.html',
    'package.json',
    'package-lock.json',
    '.vscode',
    '*.log'
];

/**
 * 创建构建目录
 */
function createBuildDir() {
    if (!fs.existsSync(BUILD_DIR)) {
        fs.mkdirSync(BUILD_DIR, { recursive: true });
        console.log(`✅ 创建构建目录: ${BUILD_DIR}`);
    }
}

/**
 * 复制文件到构建目录
 */
function copyFiles() {
    console.log('📁 复制文件...');
    
    INCLUDE_FILES.forEach(file => {
        if (fs.existsSync(file)) {
            const destPath = path.join(BUILD_DIR, file);
            fs.copyFileSync(file, destPath);
            console.log(`   ✓ ${file}`);
        } else {
            console.warn(`   ⚠️  文件不存在: ${file}`);
        }
    });
}

/**
 * 创建ZIP包
 */
function createZipPackage() {
    return new Promise((resolve, reject) => {
        const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
        const version = manifest.version;
        const zipName = `${PACKAGE_NAME}-v${version}.zip`;
        const zipPath = path.join(BUILD_DIR, zipName);
        
        console.log(`📦 创建ZIP包: ${zipName}`);
        
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // 最高压缩级别
        });
        
        output.on('close', () => {
            const sizeKB = (archive.pointer() / 1024).toFixed(2);
            console.log(`✅ ZIP包创建完成: ${zipName} (${sizeKB} KB)`);
            resolve(zipPath);
        });
        
        archive.on('error', (err) => {
            console.error('❌ ZIP包创建失败:', err);
            reject(err);
        });
        
        archive.pipe(output);
        
        // 添加文件到ZIP
        INCLUDE_FILES.forEach(file => {
            if (fs.existsSync(file)) {
                archive.file(file, { name: file });
            }
        });
        
        archive.finalize();
    });
}

/**
 * 验证manifest.json
 */
function validateManifest() {
    console.log('🔍 验证manifest.json...');
    
    try {
        const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
        
        // 检查必需字段
        const requiredFields = ['manifest_version', 'name', 'version', 'description'];
        const missingFields = requiredFields.filter(field => !manifest[field]);
        
        if (missingFields.length > 0) {
            console.error(`❌ manifest.json缺少必需字段: ${missingFields.join(', ')}`);
            return false;
        }
        
        // 检查版本格式
        const versionRegex = /^\d+\.\d+(\.\d+)?$/;
        if (!versionRegex.test(manifest.version)) {
            console.error(`❌ 版本号格式不正确: ${manifest.version}`);
            return false;
        }
        
        console.log(`✅ manifest.json验证通过 (v${manifest.version})`);
        return true;
        
    } catch (error) {
        console.error('❌ manifest.json解析失败:', error.message);
        return false;
    }
}

/**
 * 生成构建信息
 */
function generateBuildInfo() {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    const buildInfo = {
        name: manifest.name,
        version: manifest.version,
        buildTime: new Date().toISOString(),
        files: INCLUDE_FILES.filter(file => fs.existsSync(file))
    };
    
    const buildInfoPath = path.join(BUILD_DIR, 'build-info.json');
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
    console.log('📋 生成构建信息: build-info.json');
}

/**
 * 主构建函数
 */
async function build() {
    console.log('🚀 开始构建 Obsidian WriteUp Helper...\n');
    
    try {
        // 验证manifest
        if (!validateManifest()) {
            process.exit(1);
        }
        
        // 创建构建目录
        createBuildDir();
        
        // 复制文件
        copyFiles();
        
        // 生成构建信息
        generateBuildInfo();
        
        // 创建ZIP包
        await createZipPackage();
        
        console.log('\n🎉 构建完成！');
        console.log(`📁 构建文件位于: ${BUILD_DIR}/`);
        console.log('\n📝 安装说明:');
        console.log('1. 打开Chrome浏览器');
        console.log('2. 访问 chrome://extensions/');
        console.log('3. 开启"开发者模式"');
        console.log('4. 点击"加载已解压的扩展程序"');
        console.log(`5. 选择 ${BUILD_DIR} 目录`);
        
    } catch (error) {
        console.error('\n❌ 构建失败:', error.message);
        process.exit(1);
    }
}

// 检查是否直接运行此脚本
if (require.main === module) {
    build();
}

module.exports = { build, validateManifest };

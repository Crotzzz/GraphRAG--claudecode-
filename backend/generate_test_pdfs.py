"""
生成多个医疗测试 PDF 文档（用于 GraphRAG 系统测试）
运行: python generate_test_pdfs.py
输出: backend/data/uploads/ 下生成多个 PDF 文件
"""

import os
from pathlib import Path
from fpdf import FPDF

OUTPUT_DIR = Path(__file__).parent / "backend" / "data" / "uploads"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── 中文字体 ──
FONT_PATH = None
for fp in ["C:\\Windows\\Fonts\\simsun.ttc", "C:\\Windows\\Fonts\\simhei.ttf"]:
    if os.path.exists(fp):
        FONT_PATH = fp
        break
FONT_NAME = "CJK"


def _setup_font(pdf: FPDF):
    if FONT_PATH:
        pdf.add_font(FONT_NAME, "", FONT_PATH)
        pdf.add_font(FONT_NAME, "B", FONT_PATH)


def title(pdf, txt):
    pdf.set_font(FONT_NAME, "B", 18)
    pdf.cell(0, 12, txt, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

def h1(pdf, txt):
    pdf.set_font(FONT_NAME, "B", 14)
    pdf.cell(0, 10, txt, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

def h2(pdf, txt):
    pdf.set_font(FONT_NAME, "B", 12)
    pdf.cell(0, 8, txt, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

def body(pdf, txt):
    pdf.set_font(FONT_NAME, "", 10)
    pdf.multi_cell(0, 5.5, txt)
    pdf.ln(1)

def row(pdf, txt):
    pdf.set_font(FONT_NAME, "", 10)
    pdf.cell(0, 6, txt, new_x="LMARGIN", new_y="NEXT")

def table(pdf, headers, data, col_widths=None):
    pdf.set_font(FONT_NAME, "B", 9)
    if col_widths is None:
        col_widths = [180 // len(headers)] * len(headers)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 7, h, border=1, align="C")
    pdf.ln()
    pdf.set_font(FONT_NAME, "", 9)
    for row_data in data:
        for i, cell in enumerate(row_data):
            pdf.cell(col_widths[i], 6, str(cell), border=1, align="C")
        pdf.ln()
    pdf.ln(3)


# ═══════════════════════════════════════════════════════════════
#  文档 1: 内科出院小结
# ═══════════════════════════════════════════════════════════════

def doc1_internal_medicine():
    pdf = FPDF()
    pdf.add_page()
    _setup_font(pdf)

    title(pdf, "出院小结")
    pdf.ln(2)

    h1(pdf, "一、基本信息")
    body(pdf, "姓名: 赵建国    性别: 男    年龄: 62岁    病房号: 内科-312")
    body(pdf, "住院号: ZY20260815001    入院日期: 2026-08-10    出院日期: 2026-08-18")
    body(pdf, "过敏史: 磺胺类药物过敏")

    h1(pdf, "二、入院诊断")
    body(pdf, "1. 慢性阻塞性肺疾病（COPD）急性加重期")
    body(pdf, "2. 肺部感染（社区获得性肺炎）")
    body(pdf, "3. 2型糖尿病")
    body(pdf, "4. 高血压病2级（高危）")

    h1(pdf, "三、入院情况")
    body(pdf, '患者因"反复咳嗽、咳痰20年，加重伴发热、呼吸困难5天"于2026年8月10日入院。'
              '患者20年前确诊COPD，长期吸入布地奈德福莫特罗维持治疗。5天前受凉后出现咳嗽加重，'
              '咳黄色脓痰，量约50ml/日，伴发热（T 38.6℃）、活动后气促。门诊血常规示WBC 13.5×10⁹/L，'
              'NEUT% 82%，CRP 45mg/L。胸片提示双肺纹理增粗，右下肺斑片状阴影。')

    h1(pdf, "四、住院经过")
    body(pdf, "入院后予头孢哌酮舒巴坦钠3g ivgtt q8h抗感染，氨溴索30mg iv bid祛痰，"
              "多索茶碱0.3g ivgtt qd平喘。并行痰培养+药敏检查。入院第3天体温恢复正常，"
              "第5天咳嗽咳痰明显好转。血糖监测示空腹血糖7.8-9.2mmol/L，"
              "调整降糖方案为二甲双胍0.5g tid + 格列美脲2mg qd。血压监测波动在140-155/85-95mmHg，"
              "继续口服硝苯地平控释片30mg qd。")

    h1(pdf, "五、出院诊断")
    body(pdf, "1. 慢性阻塞性肺疾病（COPD）急性加重期（已控制）")
    body(pdf, "2. 社区获得性肺炎（已治愈）")
    body(pdf, "3. 2型糖尿病（血糖控制欠佳）")
    body(pdf, "4. 高血压病2级（高危）（血压控制可）")

    h1(pdf, "六、出院医嘱")
    body(pdf, "1. 继续口服头孢呋辛酯0.5g bid ×5天")
    body(pdf, "2. 布地奈德福莫特罗吸入剂 1吸 bid（长期维持）")
    body(pdf, "3. 二甲双胍0.5g tid + 格列美脲2mg qd")
    body(pdf, "4. 硝苯地平控释片30mg qd")
    body(pdf, "5. 1周后门诊复查血常规、CRP、血糖")
    body(pdf, "6. 戒烟，避免受凉，适当康复锻炼")

    h1(pdf, "七、医师签名")
    row(pdf, "主治医师: 陈丽华")
    row(pdf, "科室: 呼吸内科")

    path = OUTPUT_DIR / "内科出院小结-赵建国.pdf"
    pdf.output(str(path))
    print(f"  ✅ {path.name}")

# ═══════════════════════════════════════════════════════════════
#  文档 2: 检验报告单
# ═══════════════════════════════════════════════════════════════

def doc2_lab_report():
    pdf = FPDF()
    pdf.add_page()
    _setup_font(pdf)

    title(pdf, "临床检验报告单")
    pdf.ln(1)

    h1(pdf, "患者信息")
    row(pdf, "姓名: 李丽华    性别: 女    年龄: 45岁    病历号: LAB20260820001")
    row(pdf, "科室: 消化内科    标本类型: 静脉血    采样时间: 2026-08-20 07:30")
    pdf.ln(2)

    h1(pdf, "血常规检验结果")
    table(pdf,
        ["检验项目", "结果", "参考范围", "单位", "提示"],
        [
            ["WBC（白细胞计数）", "11.2", "3.5-9.5", "×10⁹/L", "↑"],
            ["RBC（红细胞计数）", "4.52", "3.8-5.1", "×10¹²/L", "—"],
            ["Hb（血红蛋白）", "132", "115-150", "g/L", "—"],
            ["PLT（血小板计数）", "289", "125-350", "×10⁹/L", "—"],
            ["NEUT%（中性粒细胞比）", "78.5", "40-75", "%", "↑"],
            ["LYMPH%（淋巴细胞比）", "15.3", "20-50", "%", "↓"],
        ],
        col_widths=[52, 30, 35, 30, 15])

    h1(pdf, "肝功能检验结果")
    table(pdf,
        ["检验项目", "结果", "参考范围", "单位", "提示"],
        [
            ["ALT（谷丙转氨酶）", "168", "10-40", "U/L", "↑"],
            ["AST（谷草转氨酶）", "142", "10-40", "U/L", "↑"],
            ["GGT（γ-谷氨酰转移酶）", "235", "7-45", "U/L", "↑"],
            ["TBIL（总胆红素）", "45.6", "3.4-17.1", "μmol/L", "↑"],
            ["DBIL（直接胆红素）", "28.3", "0-6.8", "μmol/L", "↑"],
            ["ALB（白蛋白）", "36.2", "35-55", "g/L", "—"],
        ],
        col_widths=[52, 30, 35, 30, 15])

    h1(pdf, "肾功能检验结果")
    table(pdf,
        ["检验项目", "结果", "参考范围", "单位", "提示"],
        [
            ["Cr（肌酐）", "72", "44-104", "μmol/L", "—"],
            ["BUN（尿素氮）", "5.8", "3.2-7.1", "mmol/L", "—"],
            ["UA（尿酸）", "386", "155-357", "μmol/L", "↑"],
        ],
        col_widths=[52, 30, 35, 30, 15])

    h1(pdf, "心肌酶检验结果")
    table(pdf,
        ["检验项目", "结果", "参考范围", "单位", "提示"],
        [
            ["CK（肌酸激酶）", "185", "30-170", "U/L", "—"],
            ["CK-MB（肌酸激酶同工酶）", "22", "0-24", "U/L", "—"],
            ["cTnI（肌钙蛋白I）", "0.03", "0-0.04", "ng/mL", "—"],
        ],
        col_widths=[52, 30, 35, 30, 15])

    h1(pdf, "肿瘤标志物检验结果")
    table(pdf,
        ["检验项目", "结果", "参考范围", "单位", "提示"],
        [
            ["AFP（甲胎蛋白）", "8.5", "0-20", "ng/mL", "—"],
            ["CEA（癌胚抗原）", "3.2", "0-5", "ng/mL", "—"],
            ["CA19-9", "128", "0-37", "U/mL", "↑"],
            ["CA125", "15.6", "0-35", "U/mL", "—"],
        ],
        col_widths=[52, 30, 35, 30, 15])

    h1(pdf, "检验结论")
    body(pdf, "1. 白细胞计数升高，中性粒细胞比例升高——提示存在感染性病变。")
    body(pdf, "2. 转氨酶（ALT/AST）显著升高，胆红素升高——提示肝细胞损伤伴梗阻性黄疸。")
    body(pdf, "3. CA19-9升高——建议进一步影像学检查排除胆胰系统肿瘤。")
    body(pdf, "4. 尿酸偏高——建议低嘌呤饮食，定期复查。")

    path = OUTPUT_DIR / "检验报告-李丽华.pdf"
    pdf.output(str(path))
    print(f"  ✅ {path.name}")


# ═══════════════════════════════════════════════════════════════
#  文档 3: 手术记录
# ═══════════════════════════════════════════════════════════════

def doc3_surgery_record():
    pdf = FPDF()
    pdf.add_page()
    _setup_font(pdf)

    title(pdf, "手术记录")
    pdf.ln(1)

    h1(pdf, "一、患者信息")
    body(pdf, "姓名: 陈伟强    性别: 男    年龄: 55岁    病历号: SUR20260825001")

    h1(pdf, "二、手术信息")
    body(pdf, "手术日期: 2026-08-25")
    body(pdf, "手术名称: 腹腔镜胆囊切除术（LC）")
    body(pdf, "手术方式: 全身麻醉下腹腔镜探查+胆囊切除术")
    body(pdf, "术前诊断: 胆囊结石伴慢性胆囊炎急性发作")
    body(pdf, "术后诊断: 胆囊结石伴慢性胆囊炎急性发作，胆囊周围粘连")

    h1(pdf, "三、手术经过")
    body(pdf, "患者取平卧位，常规消毒铺巾。全麻成功后，取脐上缘切口1cm，"
              "穿刺建立气腹（压力12mmHg）。置入腹腔镜探查：见肝脏大小正常，"
              "胃及十二指肠未见异常。胆囊约12×5cm大小，壁增厚约0.8cm，"
              "与周围组织轻度粘连。胆囊内可触及多枚结石。")
    body(pdf, "于剑突下、右肋缘下分别穿刺置入操作器械。解剖胆囊三角，"
              "分离出胆囊管及胆囊动脉，分别以生物夹夹闭切断。"
              "自胆囊床剥离胆囊，创面电凝止血。冲洗腹腔，未见活动性出血。"
              "清点纱布器械无误，逐层关闭切口。手术顺利，术中出血约30ml。")

    h1(pdf, "四、麻醉方式")
    body(pdf, "气管插管全身麻醉")

    h1(pdf, "五、术后处理")
    body(pdf, "1. 禁食6小时后改为流质饮食")
    body(pdf, "2. 头孢呋辛酯0.5g bid ×3天预防感染")
    body(pdf, "3. 布洛芬缓释胶囊300mg bid 止痛")

    h1(pdf, "六、手术人员")
    body(pdf, "主刀医师: 张明远    职称: 主任医师")
    body(pdf, "一助: 王磊    二助: 刘芳")

    path = OUTPUT_DIR / "手术记录-陈伟强.pdf"
    pdf.output(str(path))
    print(f"  ✅ {path.name}")


# ═══════════════════════════════════════════════════════════════
#  文档 4: 体检报告
# ═══════════════════════════════════════════════════════════════

def doc4_health_check():
    pdf = FPDF()
    pdf.add_page()
    _setup_font(pdf)

    title(pdf, "健康体检报告")
    pdf.ln(1)

    h1(pdf, "一、基本信息")
    body(pdf, "姓名: 林小梅    性别: 女    年龄: 35岁    体检号: TJ20260901001")
    body(pdf, "体检日期: 2026-09-01    联系电话: 139****2255")

    h1(pdf, "二、体格检查")
    table(pdf,
        ["检查项目", "结果", "参考范围", "单位"],
        [
            ["身高", "162", "—", "cm"],
            ["体重", "68.5", "—", "kg"],
            ["BMI", "26.1", "18.5-23.9", "kg/m²"],
            ["收缩压", "135", "90-139", "mmHg"],
            ["舒张压", "88", "60-89", "mmHg"],
            ["心率", "78", "60-100", "次/分"],
            ["体温", "36.5", "36.0-37.2", "℃"],
        ],
        col_widths=[42, 32, 42, 28])

    h1(pdf, "三、实验室检查")
    table(pdf,
        ["检验项目", "结果", "参考范围", "提示"],
        [
            ["空腹血糖", "6.8", "3.9-6.1", "↑"],
            ["总胆固醇", "5.9", "3.1-5.7", "↑"],
            ["甘油三酯", "3.2", "0.56-1.7", "↑"],
            ["低密度脂蛋白", "3.8", "<3.4", "↑"],
            ["高密度脂蛋白", "1.0", ">1.0", "—"],
            ["尿酸", "420", "155-357", "↑"],
        ],
        col_widths=[52, 30, 35, 20])

    h1(pdf, "四、影像学检查")
    body(pdf, "腹部B超: 轻度脂肪肝。肝胆胰脾肾未见明显占位性病变。")
    body(pdf, "乳腺B超: 双乳腺增生，BI-RADS 2类。")
    body(pdf, "胸部X线: 双肺纹理清晰，心影大小正常。")

    h1(pdf, "五、汇总建议")
    body(pdf, "1. 超重（BMI 26.1）——建议控制饮食，增加运动，目标体重60kg。")
    body(pdf, "2. 空腹血糖偏高——建议行OGTT检查排除糖尿病。")
    body(pdf, "3. 高脂血症——建议低脂饮食，必要时药物治疗。")
    body(pdf, "4. 高尿酸血症——建议低嘌呤饮食，多饮水。")
    body(pdf, "5. 年度复查。")

    path = OUTPUT_DIR / "体检报告-林小梅.pdf"
    pdf.output(str(path))
    print(f"  ✅ {path.name}")


# ═══════════════════════════════════════════════════════════════
#  文档 5: 儿科病历
# ═══════════════════════════════════════════════════════════════

def doc5_pediatric():
    pdf = FPDF()
    pdf.add_page()
    _setup_font(pdf)

    title(pdf, "儿科急诊病历")
    pdf.ln(1)

    h1(pdf, "一、患儿信息")
    body(pdf, "姓名: 张小宝    性别: 男    年龄: 3岁6个月    病历号: PD20260905001")
    body(pdf, "家长姓名: 张伟    联系电话: 136****8842")
    body(pdf, "就诊时间: 2026-09-05 22:30    过敏史: 无")

    h1(pdf, "二、主诉")
    body(pdf, "发热伴皮疹2天，抽搐1次。")

    h1(pdf, "三、现病史")
    body(pdf, "患儿于2天前无明显诱因出现发热，体温最高39.5℃。发热时伴畏寒，"
              "无寒战。同时出现全身散在红色斑丘疹，压之褪色，无瘙痒。"
              "今日下午4时许突发意识丧失、四肢抽搐、口吐白沫，持续约3分钟自行缓解，"
              "急诊来院。发病以来，患儿精神萎靡，食欲减退，二便正常。")

    h1(pdf, "四、既往史")
    body(pdf, "足月顺产，出生体重3.2kg。按时接种疫苗。既往体健，无高热惊厥史。")

    h1(pdf, "五、体格检查")
    body(pdf, "T 39.2℃  P 128次/分  R 32次/分  BP 90/60mmHg")
    body(pdf, "神志清楚，精神萎靡。全身皮肤可见散在红色斑丘疹，部分融合成片。")
    body(pdf, "咽部充血，双侧扁桃体Ⅱ°肿大，未见脓点。颈软，无抵抗。")
    body(pdf, "心肺听诊未见异常。腹软，无压痛。")
    body(pdf, "神经系统检查：双侧瞳孔等大正圆，对光反射灵敏。Babinski征阴性。")

    h1(pdf, "六、辅助检查")
    body(pdf, "血常规: WBC 15.8×10⁹/L, NEUT% 68%, LYMPH% 25%, CRP 32mg/L")
    body(pdf, "降钙素原: 0.5ng/mL")
    body(pdf, "脑电图: 未见明显异常")

    h1(pdf, "七、诊断")
    body(pdf, "1. 上呼吸道感染")
    body(pdf, "2. 热性惊厥")
    body(pdf, "3. 病毒性皮疹（待排除）")

    h1(pdf, "八、处理意见")
    body(pdf, "1. 布洛芬混悬液 5ml prn（体温>38.5℃时服用）")
    body(pdf, "2. 头孢克肟颗粒 25mg bid ×3天")
    body(pdf, "3. 对乙酰氨基酚滴剂 1.5ml prn（与布洛芬交替使用）")
    body(pdf, "4. 如再次抽搐或高热不退，立即来院复诊")
    body(pdf, "5. 随诊观察皮疹变化，必要时转皮肤科")

    h1(pdf, "九、医师签名")
    row(pdf, "医师: 周晓燕")
    row(pdf, "科室: 儿科急诊")

    path = OUTPUT_DIR / "儿科病历-张小宝.pdf"
    pdf.output(str(path))
    print(f"  ✅ {path.name}")


# ═══════════════════════════════════════════════════════════════
#  文档 6: 影像学报告
# ═══════════════════════════════════════════════════════════════

def doc6_radiology():
    pdf = FPDF()
    pdf.add_page()
    _setup_font(pdf)

    title(pdf, "CT 检查报告单")
    pdf.ln(1)

    h1(pdf, "一、患者信息")
    body(pdf, "姓名: 黄丽英    性别: 女    年龄: 68岁    病历号: RAD20260910001")
    body(pdf, "检查部位: 头颅CT平扫    检查日期: 2026-09-10")

    h1(pdf, "二、影像所见")
    body(pdf, "双侧大脑半球对称，中线结构居中。")
    body(pdf, "左侧基底节区可见类圆形高密度影，大小约2.5×1.8cm，CT值约65HU，"
              "周围可见低密度水肿带。")
    body(pdf, "右侧侧脑室前角旁可见斑片状低密度影，边界模糊。")
    body(pdf, "脑室系统未见明显扩张。脑沟、脑裂增宽加深，符合老年性脑改变。")
    body(pdf, "蝶鞍及鞍区未见异常。颅骨未见骨折征象。")

    h1(pdf, "三、诊断意见")
    body(pdf, "1. 左侧基底节区出血（急性期，约2.5×1.8cm）")
    body(pdf, "2. 右侧侧脑室前角旁缺血灶")
    body(pdf, "3. 老年性脑改变")
    body(pdf, "4. 建议结合临床，必要时复查CTA排除动脉瘤")

    h1(pdf, "四、医师签名")
    row(pdf, "报告医师: 赵志强")
    row(pdf, "审核医师: 钱学峰")

    path = OUTPUT_DIR / "CT报告-黄丽英.pdf"
    pdf.output(str(path))
    print(f"  ✅ {path.name}")


# ═══════════════════════════════════════════════════════════════
#  主程序
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print(f"\n生成测试 PDF 文件到: {OUTPUT_DIR}\n")
    doc1_internal_medicine()
    doc2_lab_report()
    doc3_surgery_record()
    doc4_health_check()
    doc5_pediatric()
    doc6_radiology()

    print(f"\n共生成 6 个测试 PDF 文件\n")
    for f in sorted(OUTPUT_DIR.glob("*.pdf")):
        print(f"  📄 {f.name}  ({f.stat().st_size // 1024} KB)")
    print()

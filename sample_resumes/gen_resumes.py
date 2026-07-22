#!/usr/bin/env python3
"""Generate sample resume PDFs for testing the Genform -> Genia ingestion pipeline."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, HRFlowable
)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Name", fontSize=20, leading=24,
                          spaceAfter=2, textColor=colors.HexColor("#1a1a2e")))
styles.add(ParagraphStyle(name="Contact", fontSize=9.5, leading=13,
                          textColor=colors.HexColor("#444444"), spaceAfter=8))
styles.add(ParagraphStyle(name="Section", fontSize=12, leading=15, spaceBefore=10,
                          spaceAfter=4, textColor=colors.HexColor("#0f3460"),
                          fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="Role", fontSize=10.5, leading=14,
                          fontName="Helvetica-Bold", spaceBefore=4))
styles.add(ParagraphStyle(name="Meta", fontSize=9, leading=12,
                          textColor=colors.HexColor("#666666"), spaceAfter=2))
styles.add(ParagraphStyle(name="Body2", parent=styles["BodyText"], fontSize=9.5,
                          leading=13, alignment=TA_LEFT))


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(x, styles["Body2"]), leftIndent=10) for x in items],
        bulletType="bullet", bulletFontSize=6, leftIndent=12, spaceBefore=2,
    )


def build(filename, data):
    path = os.path.join(OUT_DIR, filename)
    doc = SimpleDocTemplate(path, pagesize=A4,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm)
    story = []
    story.append(Paragraph(data["name"], styles["Name"]))
    story.append(Paragraph(data["title"], ParagraphStyle(
        name="t", fontSize=11, textColor=colors.HexColor("#0f3460"), spaceAfter=4)))
    story.append(Paragraph(data["contact"], styles["Contact"]))
    story.append(HRFlowable(width="100%", thickness=1,
                            color=colors.HexColor("#cccccc"), spaceAfter=6))

    story.append(Paragraph("Professional Summary", styles["Section"]))
    story.append(Paragraph(data["summary"], styles["Body2"]))

    story.append(Paragraph("Skills", styles["Section"]))
    story.append(Paragraph(data["skills"], styles["Body2"]))

    story.append(Paragraph("Work Experience", styles["Section"]))
    for job in data["experience"]:
        story.append(Paragraph(job["role"], styles["Role"]))
        story.append(Paragraph(job["meta"], styles["Meta"]))
        story.append(bullets(job["points"]))

    story.append(Paragraph("Education", styles["Section"]))
    for edu in data["education"]:
        story.append(Paragraph(edu["deg"], styles["Role"]))
        story.append(Paragraph(edu["meta"], styles["Meta"]))

    if data.get("certs"):
        story.append(Paragraph("Certifications", styles["Section"]))
        story.append(bullets(data["certs"]))

    doc.build(story)
    print("wrote", path)


resumes = [
    {
        "file": "resume_ahmad_faisal_cybersecurity.pdf",
        "name": "Ahmad Faisal bin Rahman",
        "title": "Cyber Security Analyst",
        "contact": "Shah Alam, Selangor &bull; ahmad.faisal@example.com &bull; +60 12-345 6789 &bull; linkedin.com/in/ahmadfaisal",
        "summary": "Cyber security analyst with 6 years of experience in security operations, "
                   "threat detection, incident response and penetration testing. Skilled in "
                   "operating SOC tooling, SIEM correlation, and vulnerability management for "
                   "enterprise and financial-sector clients.",
        "skills": "SIEM (Splunk, QRadar), SOC operations, Incident Response, Penetration Testing, "
                  "Vulnerability Assessment, Network Security, Firewalls, Python scripting, "
                  "MITRE ATT&amp;CK, Threat Intelligence, ISO 27001.",
        "experience": [
            {"role": "Senior Security Analyst — CyberDefend Sdn Bhd",
             "meta": "Kuala Lumpur | Jan 2021 – Present",
             "points": [
                 "Lead a 24/7 SOC team monitoring 400+ endpoints with Splunk Enterprise Security.",
                 "Reduced mean time to detect (MTTD) by 40% through custom SIEM correlation rules.",
                 "Conducted quarterly penetration tests and produced remediation reports for clients.",
             ]},
            {"role": "Security Analyst — SecureNet Solutions",
             "meta": "Cyberjaya | Jun 2018 – Dec 2020",
             "points": [
                 "Investigated phishing and malware incidents; performed root-cause analysis.",
                 "Managed vulnerability scanning with Nessus and tracked patch compliance.",
             ]},
        ],
        "education": [
            {"deg": "BSc (Hons) Computer Science — Cyber Security",
             "meta": "Universiti Teknologi Malaysia (UTM), 2018"},
        ],
        "certs": ["CISSP", "CompTIA Security+", "Certified Ethical Hacker (CEH)"],
    },
    {
        "file": "resume_nurul_aisyah_dataanalyst.pdf",
        "name": "Nurul Aisyah binti Kamal",
        "title": "Data Analyst / Data Scientist",
        "contact": "Petaling Jaya, Selangor &bull; nurul.aisyah@example.com &bull; +60 13-987 6543 &bull; linkedin.com/in/nurulaisyah",
        "summary": "Data analyst with 4 years turning raw data into business insight. Strong in "
                   "SQL, Python and dashboarding, with hands-on machine learning for forecasting "
                   "and customer segmentation in retail and e-commerce.",
        "skills": "Python (pandas, scikit-learn), SQL, Power BI, Tableau, Excel, Statistics, "
                  "Machine Learning, Data Visualization, ETL, A/B Testing, Google BigQuery.",
        "experience": [
            {"role": "Data Analyst — ShopMart E-Commerce",
             "meta": "Kuala Lumpur | Mar 2022 – Present",
             "points": [
                 "Built Power BI dashboards tracking sales KPIs used by 3 departments daily.",
                 "Developed a churn-prediction model (scikit-learn) improving retention by 12%.",
                 "Automated weekly ETL pipelines in Python, saving ~10 hours of manual work.",
             ]},
            {"role": "Junior Data Analyst — RetailIntel",
             "meta": "Puchong | Feb 2020 – Feb 2022",
             "points": [
                 "Wrote SQL queries to segment customers for targeted marketing campaigns.",
                 "Produced monthly performance reports and ad-hoc analyses for management.",
             ]},
        ],
        "education": [
            {"deg": "BSc Statistics",
             "meta": "Universiti Malaya (UM), 2019"},
        ],
        "certs": ["Google Data Analytics Professional Certificate",
                  "Microsoft Certified: Power BI Data Analyst Associate"],
    },
    {
        "file": "resume_lim_weijie_softwareengineer.pdf",
        "name": "Lim Wei Jie",
        "title": "Full Stack Software Engineer",
        "contact": "George Town, Penang &bull; lim.weijie@example.com &bull; +60 16-222 3344 &bull; github.com/limweijie",
        "summary": "Full stack software engineer with 5 years building scalable web applications. "
                   "Comfortable across the stack with React, Node.js and cloud infrastructure on "
                   "AWS, with a focus on clean APIs and CI/CD automation.",
        "skills": "JavaScript, TypeScript, React, Node.js, Express, PostgreSQL, MongoDB, "
                  "REST APIs, Docker, Kubernetes, AWS (EC2, S3, Lambda), CI/CD, Git, Agile.",
        "experience": [
            {"role": "Software Engineer — CloudWorks Technologies",
             "meta": "Bayan Lepas, Penang | Apr 2021 – Present",
             "points": [
                 "Built and maintained a React + Node.js SaaS platform serving 20k monthly users.",
                 "Migrated monolith to containerized microservices on AWS ECS, cutting deploy time 60%.",
                 "Implemented CI/CD with GitHub Actions and automated integration tests.",
             ]},
            {"role": "Junior Web Developer — DigitalCraft",
             "meta": "Kuala Lumpur | Jan 2019 – Mar 2021",
             "points": [
                 "Developed responsive front-end features using React and TypeScript.",
                 "Built RESTful APIs with Express and PostgreSQL for internal tools.",
             ]},
        ],
        "education": [
            {"deg": "BEng (Hons) Software Engineering",
             "meta": "Universiti Sains Malaysia (USM), 2018"},
        ],
        "certs": ["AWS Certified Developer – Associate"],
    },
    {
        "file": "resume_siti_zubaidah_infosec.pdf",
        "name": "Siti Zubaidah binti Osman",
        "title": "Information Security Engineer",
        "contact": "Cyberjaya, Selangor &bull; siti.zubaidah@example.com &bull; +60 19-555 7788 &bull; linkedin.com/in/sitizubaidah",
        "summary": "Information security engineer with 5 years securing cloud and on-premise "
                   "environments. Strong background in cyber security operations, threat hunting "
                   "and security architecture for the banking sector.",
        "skills": "Cyber Security, Cloud Security (AWS, Azure), SIEM, Threat Hunting, "
                  "Security Architecture, IAM, Firewalls, Vulnerability Management, "
                  "Python, ISO 27001, NIST, Incident Response.",
        "experience": [
            {"role": "Information Security Engineer — MayBank Digital",
             "meta": "Kuala Lumpur | Feb 2021 – Present",
             "points": [
                 "Designed cloud security controls for AWS and Azure workloads.",
                 "Ran threat-hunting campaigns and tuned SIEM alerts to cut false positives 35%.",
                 "Led ISO 27001 recertification and internal security audits.",
             ]},
            {"role": "Security Operations Engineer — TechGuard",
             "meta": "Cyberjaya | Jul 2019 – Jan 2021",
             "points": [
                 "Monitored SOC alerts and escalated confirmed cyber security incidents.",
                 "Maintained firewall and IAM policies across the enterprise.",
             ]},
        ],
        "education": [
            {"deg": "BSc (Hons) Information Security",
             "meta": "Multimedia University (MMU), 2019"},
        ],
        "certs": ["CISSP", "AWS Certified Security – Specialty"],
    },
    {
        "file": "resume_rajesh_kumar_networksecurity.pdf",
        "name": "Rajesh Kumar a/l Muniandy",
        "title": "Network Security Engineer",
        "contact": "Klang, Selangor &bull; rajesh.kumar@example.com &bull; +60 17-444 1122 &bull; linkedin.com/in/rajeshkumar",
        "summary": "Network security engineer with 7 years protecting enterprise networks. "
                   "Deep expertise in firewalls, VPNs, intrusion detection and penetration "
                   "testing, with a strong focus on cyber security hardening.",
        "skills": "Cyber Security, Network Security, Firewalls (Palo Alto, Fortinet), IDS/IPS, "
                  "VPN, Penetration Testing, Wireshark, Cisco, Routing &amp; Switching, "
                  "Linux, Python, MITRE ATT&amp;CK.",
        "experience": [
            {"role": "Network Security Engineer — Telco Nusantara",
             "meta": "Kuala Lumpur | Mar 2019 – Present",
             "points": [
                 "Managed Palo Alto and Fortinet firewalls protecting 1,000+ nodes.",
                 "Performed internal penetration tests and closed critical findings.",
                 "Deployed IDS/IPS and led cyber security hardening of the core network.",
             ]},
            {"role": "Network Engineer — NetSys Integration",
             "meta": "Shah Alam | Jan 2016 – Feb 2019",
             "points": [
                 "Configured Cisco routers and switches for enterprise clients.",
                 "Implemented site-to-site VPNs and network segmentation.",
             ]},
        ],
        "education": [
            {"deg": "BEng (Hons) Electrical &amp; Electronics Engineering",
             "meta": "Universiti Tenaga Nasional (UNITEN), 2015"},
        ],
        "certs": ["CCNP Security", "Offensive Security Certified Professional (OSCP)"],
    },
    {
        "file": "resume_tan_meiling_devsecops.pdf",
        "name": "Tan Mei Ling",
        "title": "Cloud Security / DevSecOps Engineer",
        "contact": "George Town, Penang &bull; tan.meiling@example.com &bull; +60 18-333 9900 &bull; github.com/tanmeiling",
        "summary": "DevSecOps engineer bridging software engineering and cyber security. "
                   "5 years automating secure CI/CD pipelines and hardening cloud-native "
                   "applications on AWS and Kubernetes.",
        "skills": "Cyber Security, DevSecOps, AWS, Kubernetes, Docker, CI/CD, Terraform, "
                  "Container Security, SAST/DAST, Python, Go, Vulnerability Management, "
                  "Node.js, React.",
        "experience": [
            {"role": "DevSecOps Engineer — CloudWorks Technologies",
             "meta": "Bayan Lepas, Penang | May 2021 – Present",
             "points": [
                 "Embedded SAST/DAST security scanning into GitHub Actions CI/CD pipelines.",
                 "Hardened Kubernetes clusters and enforced container security policies.",
                 "Automated infrastructure with Terraform following cyber security best practices.",
             ]},
            {"role": "Software Engineer — AppForge",
             "meta": "Kuala Lumpur | Jun 2019 – Apr 2021",
             "points": [
                 "Built Node.js and React features for a fintech web platform.",
                 "Introduced dependency scanning to catch vulnerable packages early.",
             ]},
        ],
        "education": [
            {"deg": "BSc (Hons) Computer Science",
             "meta": "Universiti Sains Malaysia (USM), 2019"},
        ],
        "certs": ["AWS Certified Security – Specialty",
                  "Certified Kubernetes Security Specialist (CKS)"],
    },
]

if __name__ == "__main__":
    for r in resumes:
        build(r["file"], r)
    print("done")

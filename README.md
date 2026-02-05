# lrag-app

"node_modules/@langchain/core/dist/node_modules/.pnpm/**/*",

### langchain doc file loader install
```
npm install langchain @langchain/community @langchain/core
npm install --save pdf-parse csv-parse text-loader word-extractor json-loader officeparser @langchain/ollama @libsql/client
npm install --save-dev @types/pdf-parse @types/csv-parse @types/word-extractor
```

### Run deepseek OCR
C:\Users\kabir\AppData\Roaming\ollama\ollama.exe run deepseek-ocr "C:\Users\kabir\OneDrive\Documents\lrag-sample-docs\Law\baubeschreibung.pdf\n<|grounding|>Convert the document to markdown."


C:\Users\kabir\AppData\Roaming\ollama\ollama.exe run deepseek-ocr "C:\Users\kabir\OneDrive\Documents\lrag-sample-docs\Law\bb-02.jpg\n<|grounding|>Convert the document to markdown."


### LICENSE check by AI states no issues in that regard

All the licenses listed in your summary are permissive open-source licenses that explicitly allow commercial use and incorporation into proprietary (closed-source, subscription-based) applications. None of them contain "copyleft" clauses (like the GPL) that would require you to open-source your entire application or modifications. 
Therefore, none of these specific licenses will conflict with or prevent your model for providing a free and paid subscription version of your Electron application. 
Key Obligations and No Major Impact
Your ability to have free and paid/proprietary versions is largely unaffected by these licenses, provided you meet their minimal requirements: 
Commercial Use Allowed: All licenses listed (MIT, ISC, Apache-2.0, BSD variants, BlueOak, Python-2.0, Public Domain, Unlicense, 0BSD) permit use in commercial, closed-source products.
No Source Code Sharing Requirement: You are not required to disclose your application's proprietary source code or any modifications you make to the open-source components.
Minimal Restrictions: The primary condition across these licenses is the requirement to include the original copyright notices, the license text itself, and a disclaimer of warranty in your application's documentation or an "About" section. 
Specific License Notes
Here are the primary obligations for the most common licenses you are using:
MIT, ISC, BSD (2-Clause and 3-Clause), 0BSD, Unlicense, Public Domain, BlueOak-1.0.0, Python-2.0, (WTFPL OR MIT): These are highly permissive, requiring little more than including the original copyright and license text with your distribution.
Apache-2.0: This license is also permissive but slightly more detailed. It requires you to include a copy of the license, retain any original copyright/attribution notices (in a NOTICE file if one exists), and document any significant changes made to the original files. It also includes an explicit patent grant, offering additional legal protection.


### LEGAL

Selling a software application involves adhering to several key legal and data privacy requirements, which can vary depending on your location and where you sell your product.

I. Business Registration and IP Protection
Business Entity: Form a legal business entity (e.g., LLC, corporation) to protect your personal assets and register your business with local authorities.
Business Licenses/Permits: Obtain necessary general and potentially industry-specific business licenses and seller's permits to operate legally and collect sales tax if required by your state/locality.
Intellectual Property (IP):
Copyright: Software is often protected by copyright law as a literary work. While copyright protection generally applies automatically, registering your software copyright with the federal government (e.g., the U.S. Copyright Office) can provide stronger enforcement rights in case of infringement.
Trademarks: Consider registering your app's name, logo, or brand to prevent others from using similar marks.
NDAs: Use Non-Disclosure Agreements (NDAs) when sharing your software's specifics with potential partners or clients (e.g., during a free trial) to maintain confidentiality.


Essential Legal Documentation
You must have clear, legally binding agreements to define the rules for using your software and limit your liability. 
Privacy Policy: This is a legal requirement in many jurisdictions (like the EU and California) if you collect any user data, even an email address or IP address. It must disclose:
What data you collect, the purpose, and the legal basis for processing.
How the data is stored and protected.
Who you share the data with (e.g., third-party vendors).
User rights to access, correct, or delete their data.
A link must be accessible from your website's homepage or within the app.
Terms of Service (ToS) / Terms of Use (ToU): This agreement sets the rules for user conduct, acceptable use, payment terms, account termination, and disclaimers of liability.
End User License Agreement (EULA): A EULA is a contract between you and the end user that grants them a license to use the software but not own it. It outlines usage restrictions, intellectual property information, warranties, and limitations of liability. While not legally mandatory in all cases, it is highly recommended for protecting your IP.
Cookie Policy: If your website uses cookies to track user behavior, you must inform users and obtain their consent, as mandated by laws like the EU Cookie Law and GDPR

Data Privacy and Security Compliance
Compliance is crucial, especially if you sell internationally. 
Global Regulations:
GDPR (General Data Protection Regulation): Applies if you offer goods or services to, or monitor the behavior of, EU residents. It mandates strict requirements for data collection (requiring clear, affirmative consent), data security, breach notifications (within 72 hours), and user rights over their data.
CCPA/CPRA (California Consumer Privacy Act): Gives California residents rights over their personal information, including the right to know what data is collected, request deletion, and opt-out of the "sale" of their data via a clear "Do Not Sell My Personal Information" link.
Other countries like Brazil (LGPD) and Singapore (PDPA) have similar laws.
Privacy by Design: Integrate privacy and security measures into the software development process from the outset, rather than as an afterthought.
Secure Data Processing: Implement strong data security practices like encryption, access controls, and regular security testing to protect personal information and prevent data breaches.

Additional Considerations
Export Control Laws: Be aware of international trade and export control laws, which might restrict selling certain software or technology to specific countries.
Accessibility: Ensure your application's website is accessible to people with disabilities, in compliance with laws like the ADA in the US.
Minor Protection: If your software targets users under 18, be aware of laws like the Children's Online Privacy Protection Act (COPPA) which requires parental consent for collecting data from children under 13. 
It is highly recommended to seek professional legal advice to tailor these requirements to your specific business model and target markets

# Data privacy / security video
https://www.youtube.com/watch?v=tsrkB9I7m80

# Change verison
To change the version number e.g 1.2.0
Update en.json/de.json VERSION tag
Update package.json and app/package.json VERSION tag
Update src/assets/template.env with VERSION tag
build and release
Update update.json entries with new versions or change existing links

update update.json to NAS ftp

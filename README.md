# lrag-app


### langchain doc file loader install
```
npm install langchain @langchain/community @langchain/core
npm install --save pdf-parse csv-parse text-loader word-extractor json-loader officeparser @langchain/ollama @libsql/client
npm install --save-dev @types/pdf-parse @types/csv-parse @types/word-extractor
```

### Ollama API KEY
b26e8f39b51d47d592c5b24ff503bc83.Tsp1iHL-zqNww8S4ZCz0i2Tm


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
import * as nj from 'numjs';
import cv from 'opencv-ts'

let IMG_SIZE: number = 500;
let MAX_LINES: number = 4000;
let N_PINS: number = 36*8;
let MIN_LOOP: number = 20;
let MIN_DISTANCE: number = 20;
let LINE_WEIGHT: number = 20;
let FILENAME: string = "";
let SCALE: number = 20;
let HOOP_DIAMETER: number = 0.625;

const imgElement = document.getElementById("imageSrc") as HTMLImageElement;
const inputElement = document.getElementById("fileInput") as HTMLInputElement;

inputElement.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    imgElement.src = URL.createObjectURL(target.files[0]);
  }
}, false);


const canvas1 = document.getElementById("canvas1") as HTMLCanvasElement;
var ctx: any = canvas1.getContext("2d")!;

const canvas2 = document.getElementById("canvas2") as HTMLCanvasElement;
var ctx2: CanvasRenderingContext2D | null = canvas2.getContext("2d")!;

const canvas3 = document.getElementById("canvas3") as HTMLCanvasElement;
var ctx3: CanvasRenderingContext2D | null = canvas3.getContext("2d")!;

let status1: HTMLElement | null = document.getElementById("status")!;
let drawStatus: any = document.getElementById("drawStatus");
let showPins: any = document.getElementById("showPins");
let pinsOutput: any = document.getElementById("pinsOutput");
let incrementalDrawing: any = document.getElementById("incrementalDrawing");
let incrementalCurrentStep: any = document.getElementById("incrementalCurrentStep");
let numberOfPins: any = document.getElementById("numberOfPins");
let numberOfLines: any = document.getElementById("numberOfLines");
let lineWeight: any = document.getElementById("lineWeight");

var R: any = {};

//pre initilization
let pin_coords: any;
let center: any;
let radius: any;

let line_cache_y: any;
let line_cache_x: any;
let line_cache_length: any;
let line_cache_weight: any;

//line variables
let error:any;
let img_result: any;    
let result: any;
let line_mask: any;
    
let line_sequence: any;
let pin: any;
let thread_length: any;
let last_pins: any;

let listenForKeys: boolean = false;
//*******************************
//      Line Generation
//*******************************

imgElement.onload = () => {
listenForKeys = false;
showStep(1);
showPins.classList.add('hidden');
incrementalDrawing.classList.add('hidden');
// Take uploaded picture, square up and put on canvas
const base_image: HTMLImageElement = new Image();
base_image.src = imgElement.src;

if (ctx) {
    ctx.canvas.width = IMG_SIZE;
    ctx.canvas.height = IMG_SIZE;
    ctx.clearRect(0,0, IMG_SIZE, IMG_SIZE);
}

if (ctx2) {
    ctx2.canvas.width = IMG_SIZE * 2;
    ctx2.canvas.height = IMG_SIZE * 2;
}



let selectedWidth: number = base_image.width;
let selectedHeight: number = base_image.height;
let xOffset: number = 0;
let yOffset: number = 0;
// square crop  center of picture
if (base_image.height > base_image.width) {
    selectedWidth = base_image.width;
    selectedHeight = base_image.width;
    yOffset = Math.floor((base_image.height - base_image.width) / 2);
} else if (base_image.width > base_image.height) {
    selectedWidth = base_image.height;
    selectedHeight = base_image.height;
    xOffset = Math.floor((base_image.width - base_image.height) / 2)
}

    ctx.drawImage(base_image, xOffset, yOffset, selectedWidth, selectedHeight, 0, 0, IMG_SIZE, IMG_SIZE);

length = IMG_SIZE;

// make grayscale by averaging the RGB channels.
// extract out the R channel because that's all we need and push graysacle image onto canvas
var imgPixels:ImageData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE);


R = nj.ones([IMG_SIZE, IMG_SIZE]).multiply(0xff);
var rdata: number[] = [];     
for(let y: number = 0; y < imgPixels.height; y++) {
    for(let x: number = 0; x < imgPixels.width; x++) {
        var i = (y * 4) * imgPixels.width + x * 4;
        var avg  = (imgPixels.data[i] + imgPixels.data[i + 1] + imgPixels.data[i + 2]) / 3;
        imgPixels.data[i] = avg; 
        imgPixels.data[i + 1] = avg; 
        imgPixels.data[i + 2] = avg;
        rdata.push(avg);
    }
}
R.selection.data = rdata;
ctx.putImageData(imgPixels, 0, 0, 0, 0, IMG_SIZE, IMG_SIZE);

//circle crop canvas
ctx.globalCompositeOperation='destination-in';
ctx.beginPath();
ctx.arc(IMG_SIZE/2,IMG_SIZE/2, IMG_SIZE/2, 0, Math.PI*2);
ctx.closePath();
ctx.fill();

// start processing
NonBlockingCalculatePins();    
}
function NonBlockingCalculatePins(): void {
    console.log("Высчитываем расположение гвоздей...");
    if (status1){
        status1.textContent = "Высчитываем расположение гвоздей...";
    }
    
    pin_coords = [];
    center = length / 2;
    radius = length / 2 - 1/2;
    let i: number = 0;

    (function codeBlock(): void {
        if(i < N_PINS){
            let angle: number = 2 * Math.PI * i / N_PINS;
            pin_coords.push([Math.floor(center + radius * Math.cos(angle)),
                Math.floor(center + radius * Math.sin(angle))]);
            i++;
            setTimeout(codeBlock, 0);
        } else {
            console.log('Гвозди расположены');
            if (status1){
                status1.textContent = "Гвозди расположены";
            }
            showStep(2);
            NonBlockingPrecalculateLines();
        }
    })();
}
function NonBlockingPrecalculateLines(): void {
    // set up necessary variables
    console.log("Высчитываем траекторию линий...");
    if (status1){
        status1.textContent = "Высчитываем траекторию линий...";
    }
    line_cache_y = Array<any>(N_PINS * N_PINS); //залупа
    line_cache_x = Array<any>(N_PINS * N_PINS); //залупа
    line_cache_length = Array<number>(N_PINS * N_PINS).fill(0); //залупа
    line_cache_weight = Array<number>(N_PINS * N_PINS).fill(1); //залупа
    let a: number = 0;

    (function codeBlock() {
        if (a < N_PINS) {
            for (let b: number = a + MIN_DISTANCE; b < N_PINS; b++) {
                let x0: number = pin_coords[a][0];
                let y0: number = pin_coords[a][1];
                
                let x1: number = pin_coords[b][0];
                let y1: number = pin_coords[b][1];
                
                let d: number = Math.floor(Number(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0)*(y1 - y0))));
                let xs: number[] = linspace(x0, x1, d);
                let ys: number[] = linspace(y0, y1, d);

                line_cache_y[b * N_PINS + a] = ys;
                line_cache_y[a * N_PINS + b] = ys;
                line_cache_x[b * N_PINS + a] = xs;
                line_cache_x[a * N_PINS + b] = xs;
                line_cache_length[b * N_PINS + a] = d;
                line_cache_length[a * N_PINS + b] = d;
            }
            a++;
            setTimeout(codeBlock, 0);
        } else {
            console.log('Done Precalculating Lines');
            if (status1){
                status1.textContent = "Траектория линиий высчитана";
            }
            
            NonBlockingLineCalculator();
            showStep(3);
        }
    })();
    }

function NonBlockingLineCalculator(){
    // set up necessary variables
    console.log("Рисуем Линии...");
    if (status1){
        status1.textContent = "Рисуем линии...";
    }
    
    error = nj.array(R.selection.data).reshape(IMG_SIZE, IMG_SIZE); //залупа?
    error = new Uint8Array(error.tolist());  //залупа?
    img_result = nj.ones([IMG_SIZE, IMG_SIZE ]).multiply(0xff);    

    result = nj.ones([IMG_SIZE * SCALE, IMG_SIZE * SCALE]).multiply(0xff);
    result =  new (cv as any).matFromArray(IMG_SIZE * SCALE, IMG_SIZE * SCALE, cv.CV_8UC1, result.selection.data);
    line_mask = nj.zeros([IMG_SIZE, IMG_SIZE], 'float64');
    
    let line_sequence = [];
    let pin = 0;
    line_sequence.push(pin);
    let thread_length = 0;
    last_pins = [];
    let l = 0;

    (function codeBlock(){
        if(l < MAX_LINES){
            if(l%10 == 0){
                draw();
            }

            let max_err = -1;
            let best_pin = -1;

            for(let offset=MIN_DISTANCE; offset < N_PINS - MIN_DISTANCE; offset++){
                let test_pin = (pin + offset) % N_PINS;
                if(last_pins.includes(test_pin)){
                    continue;
                }else {

                    let xs = line_cache_x[test_pin * N_PINS + pin];
                    let ys = line_cache_y[test_pin * N_PINS + pin];

                    const line_err: number = getLineErr(error, ys, xs) * line_cache_weight[test_pin * N_PINS + pin];
                    

                    if( line_err > max_err){
                        max_err = line_err;
                        best_pin = test_pin;
                    }
                }
            }

            line_sequence.push(best_pin);

            let xs = line_cache_x[best_pin * N_PINS + pin];
            let ys = line_cache_y[best_pin * N_PINS + pin];
            let weight = LINE_WEIGHT * line_cache_weight[best_pin * N_PINS + pin];
            
            line_mask = nj.zeros([IMG_SIZE, IMG_SIZE], 'float64');
            line_mask = setLine(line_mask, ys, xs, weight);
            error = subtractArrays(error, line_mask);


            
            let p = new cv.Point(pin_coords[pin][0] * SCALE, pin_coords[pin][1] * SCALE);
            let p2 = new cv.Point(pin_coords[best_pin][0] * SCALE, pin_coords[best_pin][1] * SCALE);
            cv.line(result, p, p2, new cv.Scalar(0, 0, 0), 2, cv.LINE_AA, 0);

            let x0 = pin_coords[pin][0];
            let y0 = pin_coords[pin][1];

            let x1 = pin_coords[best_pin][0];
            let y1 = pin_coords[best_pin][1];

            let dist = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
            thread_length += HOOP_DIAMETER / length * dist;

            last_pins.push(best_pin);
            if(last_pins.length > 20){
                last_pins.shift();
            }
            pin = best_pin;

            //update status
            drawStatus.textContent = l + " Линий нарисованы | " + Math.round((l / MAX_LINES) * 100) + "% готово";

            l++;
            setTimeout(codeBlock, 0);
        } else {
            console.log('Линии нарисованы');
            Finalize();
        }
    })();

}
function draw(): void {
    let dsize: any = new cv.Size(IMG_SIZE * 2, IMG_SIZE * 2);
    let dst: any = new cv.Mat();
    cv.resize(result, dst, dsize, 0, 0, cv.INTER_AREA);
    cv.imshow('canvasOutput2', dst);
    dst.delete();
}

function Finalize(): void {
    let dsize = new cv.Size(IMG_SIZE * 2, IMG_SIZE * 2);
    let dst = new cv.Mat();
    cv.resize(result, dst, dsize, 0, 0, cv.INTER_AREA);

    console.log("Готово");
    drawStatus.textContent = MAX_LINES + " Линии нарисованы | 100% Готово";

    cv.imshow('canvasOutput2', dst);
    console.log(line_sequence);
    if (status1){
        status1.textContent = "Готово";
    }
    pinsOutput.value = line_sequence;
    showPins.classList.remove('hidden');
    dst.delete(); 
    result.delete();
    window.scrollTo({ top: 5000, left: 0, behavior: 'smooth' });
}

function getLineErr(arr:any, coords1: number[], coords2: number[]): number {
     result = new Uint8Array(coords1.length);
    for(let i = 0; i < coords1.length; i++) {
        result[i] = arr.get(coords1[i], coords2[i]);
    }
    return getSum(result);
}

function setLine(arr: any, coords1: number[], coords2: number[], line: number) {
    for(let i = 0; i < coords1.length; i++) {
        arr.set(coords1[i], coords2[i], line);
    }
    return arr;
}

function compareMul(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
    let result: Uint8Array = new Uint8Array(arr1.length);
    for(let i = 0; i < arr1.length; i++) {
        result[i] = (arr1[i] < arr2[i]) ? 254 + 1 : 0;
    }
    return result;
}

function compareAbsdiff(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
    let rsult: Uint8Array = new Uint8Array(arr1.length);
    for(let i = 0; i < arr1.length; i++) {
        rsult[i] = (arr1[i] * arr2[i]);
    }
    return rsult;
}

function subtractArrays(arr1: { selection: { data: number[] } }, arr2: { selection: { data: number[] } }): { selection: { data: number[] } } {
    for(let i = 0; i < arr1.selection.data.length; i++){
        arr1.selection.data[i] = arr1.selection.data[i] - arr2.selection.data[i];
        if(arr1.selection.data[i] < 0){
            arr1.selection.data[i] = 0;
        }else if (arr1.selection.data[i] > 255){
            arr1.selection.data[i] = 255;
        }
    }
    return arr1;
}

function subtractArraysSimple(arr1: number[], arr2: number[]) {
    for(let i=0; i<arr1.length; i++){
        arr1[i] = arr1[i] - arr2[i];
    }
    return arr1;
}

function getSum(arr: number[]) {
    let v = 0;
    for(let i=0; i<arr.length; i++){
        v = v + arr[i];
    }
  return v;
}

function makeArr(startValue: number, stopValue: number, cardinality: number) {
  var arr: number[] = [];
  var currValue = startValue;
  var step = (stopValue - startValue) / (cardinality - 1);
  for (let i = 0; i < cardinality; i++) {
    arr.push(Math.round(currValue + (step * i)));
  }
  return arr;
}

function AddRGB(arr1: any, arr2: any, arr3: any){
    for(let i=0;i<arr1.data.length;i++){
        var avg = (arr1.data[i] + arr2.data[i] + arr3.data[i]);
        arr1.data[i] = avg;
    }
    return arr1;
}

function linspace(a: number, b: number, n: number) {
    if(typeof n === "undefined") n = Math.max(Math.round(b-a)+1,1);
    if(n<2) { return n===1?[a]:[]; }
    var i,ret = Array(n);
    n--;
    for(i=n;i>=0;i--) { ret[i] = Math.floor((i*b+(n-i)*a)/n); }
    return ret;
}

function showStep(id: number): void {
    let step1 = document.getElementById("step1") as HTMLElement;
    let step2 = document.getElementById("step2") as HTMLElement;
    let step3 = document.getElementById("step3") as HTMLElement;

    switch (id){
        case 1:
            step1.classList.remove('hidden');
            step2.classList.add('hidden');
            step3.classList.add('hidden');
            break;
        case 2:
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            step3.classList.add('hidden');
            break;
        case 3:
            step1.classList.add('hidden');
            step2.classList.add('hidden');
            step3.classList.remove('hidden');
            break;
        default:
            break;
    }
}

//********************************
//      Creation Assistant
//********************************


let pointIndex: number = 0;
let lastStepImage: any;

function startCreating(): void {
    window.speechSynthesis.getVoices();
    incrementalDrawing.classList.remove('hidden');

    let base_image2: HTMLImageElement = new Image();
    if (ctx3){
         ctx3.canvas.width = IMG_SIZE * 2;
        ctx3.canvas.height = IMG_SIZE * 2;
        ctx3.clearRect(0, 0, IMG_SIZE * 2, IMG_SIZE * 2);
        ctx3.drawImage(base_image2, 0, 0, IMG_SIZE * 2, IMG_SIZE * 2);
    }
   

    let line_sequence: number[] = pinsOutput.value.split(",").map((V: string) => { return parseInt(V) });

    window.scrollTo({ top: 5000, left: 0, behavior: 'smooth' });

    incrementalCurrentStep.textContent = "";
    pointIndex = 0;
    if (pin_coords == null) {
        CalculatePins();
    }
    nextStep();
    listenForKeys = true;
}

function startDrawing(): void {
    incrementalDrawing.classList.remove('hidden');
    listenForKeys = false;

    let base_image2: HTMLImageElement = new Image();
   if (ctx3){
     ctx3.canvas.width = IMG_SIZE * 2;
    ctx3.canvas.height = IMG_SIZE * 2;
    ctx3.clearRect(0, 0, IMG_SIZE * 2, IMG_SIZE * 2);
    ctx3.drawImage(base_image2, 0, 0, IMG_SIZE * 2, IMG_SIZE * 2);}

    let line_sequence: number[] = pinsOutput.value.split(",").map((V: string) => { return parseInt(V) });

    window.scrollTo({ top: 5000, left: 0, behavior: 'smooth' });

    incrementalCurrentStep.textContent = "";
    pointIndex = 0;
    if (pin_coords == null) {
        CalculatePins();
    }

    let j: number = 0;
    (function codeBlock() {
        if (j < MAX_LINES - 1) {
            //incrementalCurrentStep.textContent = "Current Line: " + (pointIndex + 1) + " |  Pin " + line_sequence[pointIndex] + " to " + line_sequence[pointIndex + 1];
            pointIndex++;
            if(ctx3){
                ctx3.beginPath();
                ctx3.moveTo(pin_coords[line_sequence[pointIndex - 1]][0] * 2, pin_coords[line_sequence[pointIndex - 1]][1] * 2);
                ctx3.lineTo(pin_coords[line_sequence[pointIndex]][0] * 2, pin_coords[line_sequence[pointIndex]][1] * 2);
                ctx3.strokeStyle = "black";
                ctx3.lineWidth = 0.3;
                ctx3.stroke();}
            j++;
            setTimeout(codeBlock, 0);
        } else {
        }
    })();
}

function nextStep(){
    if(pointIndex > MAX_LINES - 1){ return;}
    incrementalCurrentStep.textContent = "Текущая линия: " + (pointIndex + 1) + " |  Гвоздь " + line_sequence[pointIndex] + " к " + line_sequence[pointIndex + 1];

    if(pointIndex > 0){
        //ctx3.clearRect(0,0, IMG_SIZE * 2, IMG_SIZE * 2);
        if (ctx3)
        {ctx3.putImageData(lastStepImage, 0, 0);
        ctx3.beginPath();
        ctx3.moveTo(pin_coords[line_sequence[pointIndex - 1]][0] * 2, pin_coords[line_sequence[pointIndex - 1]][1] * 2);
        ctx3.lineTo(pin_coords[line_sequence[pointIndex]][0] * 2, pin_coords[line_sequence[pointIndex]][1] * 2);
        ctx3.strokeStyle = "black";
        ctx3.lineWidth = 0.3;
        ctx3.stroke();
        lastStepImage = ctx3.getImageData(0, 0, IMG_SIZE * 2, IMG_SIZE * 2);

        pointIndex++;
        ctx3.beginPath();
        ctx3.moveTo(pin_coords[line_sequence[pointIndex - 1]][0] * 2, pin_coords[line_sequence[pointIndex - 1]][1] * 2);
        ctx3.lineTo(pin_coords[line_sequence[pointIndex]][0] * 2, pin_coords[line_sequence[pointIndex]][1] * 2);
        ctx3.strokeStyle = "#FF0000";
        ctx3.lineWidth = 1;
        ctx3.stroke();
    }
    }
    
  
    //window.speechSynthesis.speak(new SpeechSynthesisUtterance(line_sequence[pointIndex + 1]));
}

function lastStep(){
    var i;
    if(pointIndex < 2){ return;}
    pointIndex--;
    pointIndex--;
    if (ctx3){
        ctx3.clearRect(0,0, IMG_SIZE * 2, IMG_SIZE * 2);
    }
    
    incrementalCurrentStep.textContent = "Current Line: " + (pointIndex + 1) + " |  Pin " + line_sequence[pointIndex] + " to " + line_sequence[pointIndex + 1];
    
    for(i=0; i < pointIndex; i++){
    if(ctx3) {
        ctx3.beginPath();
        ctx3.moveTo(pin_coords[line_sequence[i]][0] * 2, pin_coords[line_sequence[i]][1] * 2);
        ctx3.lineTo(pin_coords[line_sequence[i + 1]][0] * 2, pin_coords[line_sequence[i + 1]][1] * 2);
        ctx3.strokeStyle = "black";
        ctx3.lineWidth = 0.3;
        ctx3.stroke();}
    }
    if (ctx3){
        lastStepImage = ctx3.getImageData(0, 0, IMG_SIZE * 2, IMG_SIZE * 2);
    }
    pointIndex++;
    if (ctx3){
        ctx3.beginPath();
        ctx3.moveTo(pin_coords[line_sequence[pointIndex - 1]][0] * 2, pin_coords[line_sequence[pointIndex - 1]][1] * 2);
        ctx3.lineTo(pin_coords[line_sequence[pointIndex]][0] * 2, pin_coords[line_sequence[pointIndex]][1] * 2);
        ctx3.strokeStyle = "#FF0000";
        ctx3.lineWidth = 1;
        ctx3.stroke();}
}

function CalculatePins(){
    console.log("Calculating pins...");
    pin_coords = [];
    center = IMG_SIZE / 2;
    radius = IMG_SIZE / 2 - 1/2
    var i;
    let angle:number;
    for(i=0; i < N_PINS; i++){
        angle = 2 * Math.PI * i / N_PINS;
        pin_coords.push([Math.floor(center + radius * Math.cos(angle)),
            Math.floor(center + radius * Math.sin(angle))]);
    }
}

function onHasSteps(): void {
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const showPins = document.getElementById('showPins');

    if (step1 && step2 && step3 && showPins) {
        step1.classList.add('hidden');
        step2.classList.add('hidden');
        step3.classList.add('hidden');
        showPins.classList.remove('hidden');
        window.scrollTo({ top: 5000, left: 0, behavior: 'smooth' });
    }
}
document.body.onkeydown = function(e){
    if(!listenForKeys){ return; }
    if(e.keyCode == 32){ // space bar
        nextStep();
    }else if(e.keyCode == 39){ //right key
        nextStep();
    }else if(e.keyCode == 37){ //left key
        lastStep();
    }
}

function example1(){
    pinsOutput.value = "0,127,22,147,276,144,21,126,20,142,9,139,270,140,271,141,8,138,274,137,7,136,273,143,275,146,23,151,25,152,281,155,26,157,27,160,28,162,30,165,32,168,31,164,29,161,33,169,34,172,63,175,69,179,71,174,35,167,61,177,68,170,32,163,30,159,28,154,280,153,26,150,281,149,277,146,12,114,13,116,14,118,17,122,18,123,20,125,22,145,11,140,276,148,278,141,7,139,277,105,275,104,274,142,279,149,24,131,3,130,16,120,10,143,272,135,8,136,5,133,25,156,282,157,284,159,31,171,59,161,27,152,285,151,280,148,10,121,19,135,6,137,276,142,11,113,13,124,287,170,31,166,67,169,61,179,65,162,33,175,70,181,72,178,66,163,29,145,283,150,278,152,23,128,1,129,16,119,9,135,26,146,282,155,286,168,57,163,60,166,55,159,287,130,24,147,30,171,34,177,64,180,63,164,33,173,67,162,58,167,285,123,12,112,11,149,283,154,32,172,1,126,14,127,2,132,23,144,272,142,13,146,10,138,269,139,286,140,6,115,15,119,18,124,20,122,12,137,273,135,17,133,4,131,5,156,281,151,277,106,278,143,282,149,274,121,284,166,65,160,71,169,35,173,59,174,70,183,72,170,34,176,66,164,28,144,11,111,13,125,19,134,260,133,266,132,18,118,8,137,285,169,73,175,4,174,32,167,64,154,281,125,286,156,63,182,71,171,60,170,0,163,67,178,58,157,283,158,32,155,64,187,70,159,53,164,56,168,74,180,72,166,34,161,30,167,15,131,26,132,8,108,279,140,9,109,1,133,268,138,285,153,10,134,18,120,11,123,21,128,286,171,287,169,55,170,29,152,282,144,3,151,275,102,271,99,270,98,189,68,184,45,183,66,161,73,165,284,148,22,126,15,118,16,115,5,138,273,144,9,131,267,140,14,128,2,149,62,168,284,160,59,176,72,159,73,158,286,127,24,135,261,134,0,123,19,139,275,130,6,114,188,112,2,162,64,184,92,178,35,179,62,205,67,167,63,199,60,202,61,185,50,160,7,129,17,117,8,147,278,105,276,103,181,65,156,284,152,279,144,5,176,69,182,91,177,94,208,60,186,21,127,256,128,285,150,13,112,10,125,287,141,273,140,17,144,32,175,31,121,16,166,68,172,286,131,20,184,71,156,14,136,6,177,72,161,1,125,23,129,263,135,7,108,10,107,185,63,163,287,142,271,100,184,109,186,58,200,59,146,280,150,61,168,36,172,74,160,64,176,17,119,28,118,270,97,177,5,137,269,132,264,116,187,22,111,2,168,285,161,9,110,280,155,73,171,0,140,8,129,25,134,259,136,18,112,184,22,130,257,132,4,145,276,152,33,174,37,138,12,115,188,54,161,62,198,74,158,56,187,95,269,119,10,128,265,133,3,153,278,107,8,142,33,124,15,109,4,125,11,139,268,134,274,146,5,175,90,165,283,128,16,117,29,115,25,191,53,166,73,190,54,171,66,185,111,188,96,181,36,173,287,157,64,207,65,202,93,203,61,147,271,131,16,145,0,162,68,149,14,132,260,135,287,172,70,160,1,150,277,141,9,133,13,180,104,5,116,17,121,20,107,210,33,131,276,154,74,202,62,173,91,179,12,124,22,110,213,69,191,104,278,139,262,127,20,185,119,30,114,19,176,99,190,24,113,183,21,117,273,148,63,205,31,206,59,178,1,141,15,169,284,120,187,112,26,192,53,186,71,153,282,129,3,166,286,167,62,191,59,182,49,159,63,177,69,154,4,126,285,171,95,212,71,148,279,163,12,113,186,65,158,8,134,264,142,7,127,15,120,24,126,34,174,72,168,75,159,71,150,25,110,27,194,55,185,92,172,2,164,0,112,22,252,23,121,184,57,165,36,170,100,189,25,144,280,125,21,131,11,155,267,157,66,180,58,164,9,121,214,119,188,51,168,101,206,67,175,2,103,6,152,74,156,268,132,15,160,287,122,269,96,270,136,274,129,217,72,149,32,205,139,4,165,56,197,62,186,118,283,166,64,152,69,218,73,157,16,136,206,138,263,38,262,113,26,111,180,116,29,171,97,187,24,253,125,32,207,94,209,60,145,208,31,123,268,141,70,195,48,188,63,181,2,121,185,40,137,283,122,183,101,178,68,165,72,147,1,107,276,153,265,92,169,286,173,73,163,8,126,19,105,7,117,26,255,129,258,136,4,106,186,42,181,115,189,23,111,212,64,179,67,211,61,159,283,133,20,251,21,116,177,18,162,282,167,95,189,71,220,131,212,34,182,14,122,213,125,207,68,143,6,102,4,170,74,153,286,107,24,108,184,46,191,56,203,83,205,94,172,57,158,0,129,35,260,36,259,133,270,130,266,157,71,175,109,187,59,162,74,151,70,140,205,137,13,110,3,185,115,269,97,166,29,256,33,209,63,200,79,198,52,187,126,272,146,208,103,279,122,25,192,106,5,113,178,70,210,32,256,109,16,249,15,114,177,56,160,90,176,117,27,205,59,180,48,183,115,265,141,206,58,156,73,174,0,110,181,18,102,189,125,14,167,232,168,34,211,150,67,190,26,253,21,122,210,104,1,138,69,142,282,145,277,109,28,257,135,218,121,33,178,7,132,60,151,260,123,182,54,198,72,146,62,148,208,143,3,127,12,141,281,166,98,191,66,169,94,201,30,206,133,26,193,65,178,39,265,118,175,60,190,70,219,69,164,279,154,285,110,171,90,263,88,209,128,268,111,12,248,11,135,206,57,134,267,144,207,118,272,159,6,145,72,218,123,13,105,23,186,47,194,63,155,66,134,202,129,284,124,9,138,226,157,271,101,17,250,18,117,20,139,214,35,261,37,211,97,164,52,158,268,118,180,124,190,114,29,113,23,254,25,204,61,181,104,287,154,266,40,177,71,216,145,68,180,2,151,12,96,169,230,150,274,126,185,102,16,251,118,9,106,21,187,117,208,36,160,51,196,55,157,231,166,234,173,109,259,85,205,105,180,120,250,14,138,262,129,26,108,3,182,1,165,51,198,64,137,218,95,214,148,73,153,61,149,208,28,115,30,255,131,17,120,175,91,163,2,133,59,130,217,142,70,154,264,37,180,62,203,31,257,24,206,119,19,99,221,144,275,134,258,23,109,182,103,17,127,223,162,29,207,55,192,60,160,228,143,209,98,163,104,277,116,4,114,31,113,170,286,120,3,132,219,75,169,70,176,119,263,156,279,141,204,30,258,110,177,0,95,188,22,117,181,35,127,272,139,210,61,171,235,172,3,124,254,20,252,126,180,43,189,58,196,28,260,23,130,13,251,9,248,8,193,52,169,227,164,73,264,127,212,153,5,103,24,256,28,205,144,70,149,53,126,224,133,192,74,216,151,209,140,10,136,283,115,22,153,9,104,239,175,122,49,168,111,25,253,13,164,90,156,53,202,33,257,128,184,67,269,112,261,137,68,262,135,65,154,212,100,18,175,6,248,13,122,32,206,36,213,34,120,186,105,162,99,202,133,58,140,217,158,231,101,246,184,39,181,15,134,218,163,233,97,13,139,67,149,230,172,240,98,243,107,4,249,17,113,267,94,1,183,56,278,157,269,65,174,123,281,146,270,160,218,115,263,89,158,61,155,284,92,153,230,168,16,116,188,98,262,36,217,66,145,273,128,31,150,210,136,226,159,101,276,56,152,208,141,71,219,139,61,200,57,180,107,27,261,140,229,146,215,72,188,25,109,286,96,236,176,111,281,116,267,39,135,0,169,57,124,251,22,261,152,3,164,258,32,255,15,117,216,149,50,121,179,108,287,127,52,197,123,271,137,45,194,68,273,122,177,238,100,169,114,26,250,10,94,269,155,50,189,134,65,132,6,101,188,56,135,29,210,111,170,283,109,213,152,228,129,9,149,218,43,151,279,106,25,205,146,64,201,54,273,176,241,108,21,262,168,235,100,160,222,131,62,144,72,173,239,179,129,183,41,175,124,19,257,127,251,5,247,7,161,217,143,280,57,198,75,271,134,191,8,125,54,154,91,285,122,22,190,55,274,120,51,186,99,18,254,119,184,78,182,130,256,25,136,230,155,212,60,267,160,281,70,270,173,266,137,15,148,275,125,27,250,191,253,28,195,61,182,238,188,66,142,12,149,93,14,107,172,60,184,74,219,162,75,280,112,30,200,278,155,265,26,259,157,210,35,205,142,58,282,158,228,175,56,125,187,135,61,164,218,36,123,252,121,48,185,2,248,5,129,19,115,167,76,271,145,232,171,264,97,241,189,112,24,104,4,252,193,140,7,249,102,237,105,159,253,187,74,282,164,103,184,3,137,19,262,86,203,22,259,32,177,232,160,225,146,2,142,26,211,69,170,222,148,90,178,111,284,150,92,262,118,4,63,268,40,176,123,209,154,256,83,258,93,10,248,193,255,149,60,131,64,230,51,190,100,20,114,167,229,43,171,112,177,242,99,6,250,1,148,69,271,226,130,252,15,125,173,56,205,61,2,122,9,117,166,260,37,220,106,19,184,53,120,183,108,11,254,27,207,151,64,172,223,138,284,153,218,139,70,146,269,129,62,152,94,13,181,106,242,188,256,14,98,180,34,215,154,51,194,11,114,23,265,29,251,190,44,157,49,120,167,281,200,73,217,162,236,179,110,28,203,94,188,129,207,37,229,52,175,130,27,258,35,264,158,106,185,136,267,154,16,134,279,58,235,46,182,96,221,269,125,171,241,105,287,248,14,258,193,69,201,252,25,261,97,17,104,168,113,279,67,273,56,146,220,136,68,153,33,208,256,161,99,244,71,164,47,178,238,189,97,191,27,108,44,167,54,206,255,7,131,174,240,176,113,269,142,72,277,57,143,90,155,225,263,25,248,103,235,42,188,4,226,133,272,75,204,147,219,168,58,283,119,51,150,34,128,249,286,162,108,188,139,206,70,263,26,210,31,124,35,171,228,180,129,266,22,185,45,121,11,197,29,202,58,207,101,243,190,105,273,227,274,103,201,144,2,93,266,153,283,94,259,213,118,165,229,61,269,25,260,139,64,7,90,169,112,286,224,1,247,8,67,135,270,41,191,123,49,194,145,71,170,267,195,265,24,140,187,57,208,64,133,219,100,245,111,172,124,58,183,79,191,146,94,237,287,59,132,21,267,92,259,211,138,184,107,234,174,61,285,250,117,177,60,286,88,284,164,119,212,37,223,275,66,205,254,3,134,48,150,95,235,139,194,73,154,101,16,111,46,219,163,255,27,248,74,185,238,164,231,141,274,198,261,38,139,29,254,16,179,225,166,116,253,151,91,183,5,101,234,279,56,210,140,233,102,168,67,212,94,174,42,227,268,66,278,118,161,17,70,192,249,8,111,257,10,115,175,35,98,19,253,4,123,173,64,203,276,55,178,108,210,158,15,93,261,217,156,258,131,229,142,250,283,126,170,220,45,232,97,181,231,103,11,202,23,264,40,180,6,127,275,138,57,282,236,188,124,28,151,203,79,211,135,32,209,146,99,34,265,215,114,166,125,69,278,160,67,201,21,74,150,228,50,163,121,177,130,61,267,139,6,188,254,1,226,269,38,183,75,172,241,192,100,179,106,2,137,60,238,96,265,20,182,107,44,103,185,59,281,157,72,235,48,160,10,109,180,23,191,266,227,283,117,265,121,212,258,52,129,63,259,13,200,26,251,199,71,205,153,107,256,35,97,39,169,235,155,100,214,42,236,184,247,3,102,23,266,18,103,175,134,223,281,72,196,81,187,46,155,208,147,190,252,8,116,285,89,7,65,16,188,74,247,10,144,192,45,166,90,140,263,35,218,68,239,100,145,88,262,224,118,172,109,26,158,115,179,131,202,95,268,20,71,217,107,212,163,273,74,167,223,272,55,149,96,190,246,286,255,126,263,199,279,161,122,195,10,63,147,73,270,225,5,65,197,253,43,216,113,164,118,273,40,184,35,120,221,139,56,123,160,25,264,227,0,248,284,136,244,196,59,150,53,181,108,177,21,137,91,185,104,240,190,18,269,93,36,155,70,274,162,257,82,275,191,101,236,192,9,65,120,264,62,206,128,66,233,170,53,155,287,94,215,159,211,31,256,0,60,2,253,203,105,6,90,13,115,165,272,99,226,143,194,149,108,274,224,49,175,223,173,68,278,248,23,76,163,96,19,182,44,155,88,140,212,265,226,3,105,231,174,111,5,125,181,47,151,222,96,205,275,69,127,168,269,29,261,133,176,33,216,266,77,173,3,119,160,13,63,237,165,100,185,229,59,207,34,203,115,43,187,67,20,250,127,282,51,153,103,251,281,144,101,265,131,169,110,17,184,146,238,106,45,278,235,188,36,91,266,14,198,83,226,168,218,262,24,75,179,287,139,90,255,186,141,250,200,283,107,164,128,176,43,161,114,266,31,260,222,122,57,136,46,170,5,117,64,8,185,4,97,147,273,232,163,13,183,244,146,30,213,257,87,286,248,189,149,73,220,279,145,218,98,33,95,11,171,242,191,72,19,270,18,143,65,276,129,254,190,4,225,261,66,210,118,29,111,149,91,180,54,257,34,125,256,56,151,212,68,202,82,251,152,14,99,41,231,67,140,176,109,153,7,253,32,201,279,124,69,167,112,179,11,260,150,104,183,106,13,129,192,234,113,14,168,259,224,187,75,190,42,217,165,60,127,177,246,287,257,210,105,182,35,94,235,64,270,22,68,120,158,205,250,155,5,259,27,262,122,10,56,253,182,74,203,100,7,110,267,99,21,265,139,32,85,212,103,20,138,199,97,235,179,120,163,129,167,59,213,177,132,285,160,250,29,71,260,216,37,185,78,221,277,249,283,256,218,75,158,62,170,17,271,172,263,18,154,90,135,174,53,5,191,269,47,205,73,258,25,272,70,166,8,104,211,130,54,235,51,146,256,134,91,221,268,192,238,195,154,115,270,37,170,57,266,118,287,228,38,103,190,245,278,102,142,208,70,135,72,221,127,185,23,164,45,241,66,279,117,32,112,162,121,157,40,263,209,109,43,184,105,46,189,247,103,284,236,166,215,39,262,155,192,27,143,13,202,137,72,162,253,122,178,107,221,2,126,227,14,272,236,75,249,186,229,180,269,71,18,271,34,96,6,64,191,19,140,284,47,239,280,121,26,68,164,16,125,157,88,150,187,49,256,85,192,243,185,70,216,101,21,66,181,77,177,139,103,9,62,211,96,239,11,154,123,248,7,116,178,137,31,259,286,176,54,230,106,173,225,153,210,132,58,234,104,187,113,251,277,157,114,180,79,284,217,34,88,11,55,124,159,265,8,179,41,219,152,116,170,91,256,6,122,197,250,3,62,196,252,32,99,286,143,69,15,151,231,85,260,184,94,133,277,98,1,175,142,16,244,138,30,207,22,264,228,24,74,17,155,204,276,160,73,193,235,269,161,222,174,212,129,229,65,122,52,109,145,253,185,256,116,173,44,152,34,136,190,9,247,48,124,0,254,221,181,51,103,192,273,17,95,168,109,282,257,223,177,274,14,184,82,268,23,188,40,213,262,194,253,79,207,91,9,115,148,183,95,38,134,167,118,56,237,286,76,22,129,225,164,272,214,185,222,287,147,14,111,249,201,59,264,150,282,203,7,55,121,171,224,136,92,129,158,4,52,173,98,46,115,63,152,125,261,195,68,25,262,67,220,165,259,120,197,246,105,285,164,43,192,139,86,4,169,123,272,22,73,188,146,38,267,117,168,212,28,133,54,286,256,207,127,271,36,90,144,190,234,110,45,236,160,104,252,280,73,141,174,275,161,2,176,268,233,61,145,266,5,151,24,138,90,177,239,105,257,47,159,109,278,238,111,64,1,134,93,232,195,251,282,97,206,69,158,29,160,191,264,215,180,245,20,269,175,139,261,87,35,115,247,204,27,119,21,274,16,96,128,26,260,223,188,59,237,70,249,28,169,13,228,142,106,207,150,184,75,217,96,259,53,108,214,130,170,227,128,7,149,118,63,230,47,169,229,90,2,113,182,266,39,94,31,71,243,100,281,133,201,81,253,277,48,117,194,154,46,260,188,110,30,173,144,53,189,62,11,273,28,112,4,186,24,267,13,99,215,74,265,40,174,51,128,250,148,18,178,212,146,172,9,55,204,119,159,94,219,264,232,131,161,226,180,134,71,143,0,251,216,144,113,173,63,273,121,244,22,141,62,284,246,277,223,94,47,112,205,101,249,143,204,104,266,20,152,57,211,72,283,139,164,256,192,225,259,37,224,270,17,150,181,7,67,130,178,234,38,131,165,11,157,0,237,194,107,174,31,264,112,175,235,122,69,19,104,241,163,35,103,15,271,158,277,74,209,97,133,182,118,0,101,213,65,170,264,72,151,30,268,92,175,57,255,217,262,23,62,228,11,247,161,194,121,148,31,214,90,260,113,219,171,100,46,128,61,235,196,10,274,251,75,222,118,7,143,174,272,185,33,73,139,276,184,49,226,267,204,133,32,74,261,48,228,19,146,96,172,117,212,182,0,91,186,80,219,122,156,13,275,254,106,191,143,105,250,282,99,50,192,239,170,136,179,44,162,92,256,73,18,201,146,66,19,166,101,132,157,34,272,13,57,199,84,279,104,10,263,81,210,37,235,112,63,105,264,50,177,36,238,55,142,166,113,202,77,188,20,183,152,67,198,88,273,8,94,236,197,45,136,159,281,260,208,86,283,248,153,196,124,167,261,117,150,279,46,223,286,207,23,270,28,140,34,255,208,65,266,187,155,245,109,41,185,147,283,48,93,180,214,120,56,14,91,131,216,67,115,160,58,119,258,107,138,26,76,178,46,134,240,193,92,199,27,154,133,234,60,283,226,256,211,269,187,5,272,103,61,4,248,275,135,58,210,25,168,252,215,173,95,129,172,114,184,232,179,33,262,151,256,112,6,157,97,47,131,278,10,166,137,35,122,146,21,181,24,249,89,274,57,224,193,111,218,253,50,165,216,73,282,229,162,277,11,244,116,33,130,281,76,4,267,17,180,155,67,22";
}

function example2(){
    pinsOutput.value = "0,138,19,152,40,155,42,154,41,159,45,157,54,170,55,172,56,173,65,168,47,156,44,153,38,151,35,150,15,147,13,146,12,132,11,144,32,145,27,143,25,142,31,148,39,149,16,135,17,151,36,150,14,146,33,147,12,133,10,130,9,131,11,145,38,154,40,156,271,113,272,127,267,124,273,158,54,169,55,164,69,175,70,176,67,174,60,171,56,178,76,250,77,251,78,252,79,257,138,277,140,26,159,53,162,55,179,66,167,42,158,274,129,11,146,31,144,38,143,24,157,272,125,265,121,262,118,266,126,278,128,268,153,43,169,67,244,69,174,55,173,75,255,82,259,137,256,77,178,54,171,48,161,276,115,270,114,244,135,15,148,12,145,13,133,273,126,8,123,287,136,254,81,253,80,258,139,1,137,260,121,269,154,37,149,2,151,3,152,41,160,56,167,61,181,76,172,75,256,83,188,86,189,82,257,135,13,131,271,157,55,177,63,176,73,247,74,237,104,203,101,194,98,193,93,191,56,180,65,240,109,242,68,243,112,269,116,245,78,241,74,254,73,165,284,166,44,160,5,159,277,141,23,137,18,153,40,147,11,136,255,76,249,74,173,67,167,70,163,28,138,30,165,55,158,25,134,287,122,250,135,242,111,207,108,241,79,239,72,246,71,252,137,20,152,265,124,276,139,29,162,279,131,24,140,275,161,273,116,261,120,283,164,18,163,55,168,46,151,43,170,70,169,75,238,106,204,97,193,90,191,88,192,57,158,4,155,268,117,267,153,21,140,27,133,275,115,245,135,271,160,47,173,64,238,74,248,120,268,123,9,129,12,144,6,162,274,159,54,176,52,175,62,183,79,264,151,34,145,36,149,14,161,60,231,72,253,134,245,80,254,78,265,148,13,128,277,164,70,247,136,275,155,54,172,48,259,138,261,50,262,77,174,66,170,74,236,135,285,204,100,193,56,156,22,166,280,118,281,164,72,240,110,208,2,206,109,263,123,10,131,239,135,258,81,187,87,192,99,202,96,201,95,190,94,194,67,166,55,171,46,150,39,142,26,216,29,214,30,135,286,122,259,80,240,130,280,133,9,170,57,228,59,229,58,194,107,243,76,257,85,190,91,186,64,175,71,209,104,196,56,162,16,152,4,126,255,74,250,78,242,66,200,92,198,90,262,158,23,213,25,132,272,156,269,151,19,134,243,69,169,8,172,74,168,283,203,281,163,5,207,1,208,103,238,135,241,109,205,68,195,97,194,102,237,76,260,49,258,86,268,115,273,141,26,157,5,154,55,180,67,161,62,236,100,235,75,170,47,251,41,147,28,215,30,133,29,136,253,128,11,143,252,70,178,10,146,43,149,32,150,263,79,246,117,249,82,266,121,20,155,24,215,27,139,270,159,4,206,287,208,105,193,99,205,0,209,113,198,104,210,72,245,81,267,155,37,140,22,136,244,82,253,130,11,127,278,163,71,251,139,260,47,250,141,276,135,235,103,192,106,195,56,177,53,150,2,205,105,239,71,248,75,166,20,117,277,132,17,163,29,219,31,222,28,164,284,120,21,165,279,202,63,184,88,178,65,241,133,225,115,256,47,149,266,161,6,143,33,148,16,134,238,73,211,3,207,112,270,154,21,127,254,44,152,256,84,191,89,196,110,204,67,171,8,124,22,120,274,114,271,133,252,41,158,263,50,265,128,237,135,233,59,166,285,208,4,153,42,169,284,209,2,136,266,146,35,141,259,78,264,49,257,112,198,84,272,134,14,160,60,197,93,180,10,179,79,236,107,6,207,286,210,108,213,0,123,31,215,128,19,130,25,217,33,127,212,2,148,48,158,69,250,41,162,72,234,66,163,67,245,108,6,103,240,134,228,119,282,91,201,277,129,270,157,260,85,273,154,3,125,21,122,9,177,69,196,96,189,80,247,46,257,133,15,102,234,79,243,132,281,167,7,162,18,131,222,120,30,218,116,28,223,130,214,25,144,15,98,13,149,261,48,174,70,165,282,204,287,215,111,19,116,200,274,142,43,154,258,151,262,92,189,108,239,67,201,272,199,66,243,83,175,54,167,285,136,12,95,198,268,158,60,232,124,209,3,88,261,125,253,79,251,46,259,49,255,73,171,59,179,54,191,57,226,134,248,145,45,262,124,23,166,62,178,90,199,89,260,48,250,36,137,32,221,29,126,14,148,45,258,155,66,177,76,254,151,39,144,255,138,286,205,278,103,196,105,5,162,70,208,6,100,189,87,201,71,203,276,129,259,133,231,57,194,108,191,91,199,266,86,183,64,204,280,209,283,211,5,101,239,110,20,127,8,168,282,92,11,179,69,157,21,184,100,16,132,220,27,114,197,83,261,46,245,35,218,4,207,125,249,47,221,5,205,71,232,135,230,58,192,107,237,63,164,73,233,132,9,120,270,152,54,173,286,134,242,81,244,77,263,159,15,114,19,211,1,214,5,153,266,50,264,147,34,216,126,235,101,201,88,177,87,194,55,190,111,6,206,65,185,81,268,197,102,25,160,68,236,129,41,249,121,267,47,220,3,216,23,131,26,112,241,67,203,110,191,98,206,1,218,132,30,243,108,261,75,171,9,89,267,198,93,10,138,248,72,165,17,118,29,213,281,141,271,202,69,245,143,44,251,36,252,150,264,155,3,224,24,133,287,119,250,46,159,27,169,61,229,72,185,122,201,113,16,107,188,93,4,87,281,202,105,234,134,225,5,208,284,203,100,13,180,78,238,126,210,278,116,196,107,211,128,15,145,28,117,252,129,8,176,58,168,70,251,121,221,287,124,11,209,73,163,282,212,74,186,98,277,206,68,170,281,129,40,143,5,103,14,162,267,147,249,69,237,79,256,136,17,99,183,102,7,85,193,54,161,272,116,247,33,114,243,43,257,194,95,192,55,181,13,143,32,216,286,172,57,156,67,175,84,200,273,130,238,27,217,4,215,33,142,275,160,71,235,132,50,259,109,212,125,32,248,65,239,77,190,112,18,154,23,225,30,108,27,222,286,217,20,184,123,12,149,255,43,253,116,17,106,28,214,118,228,129,241,105,186,124,236,132,223,285,218,40,246,34,219,131,226,3,150,44,188,109,25,104,239,82,195,262,47,265,51,176,29,138,37,152,260,196,59,230,122,22,118,204,270,164,26,102,191,105,237,99,6,140,278,201,264,179,9,174,59,159,283,94,181,66,193,96,10,91,7,212,276,207,2,78,262,111,209,275,118,199,121,187,97,15,130,221,1,75,250,133,222,76,258,50,129,24,186,115,255,153,36,118,9,125,277,182,61,235,8,156,276,200,271,203,66,169,280,162,67,192,101,15,117,206,3,153,22,143,45,263,93,199,57,224,9,86,178,260,50,267,201,92,281,219,25,116,185,123,198,273,160,283,218,26,169,64,194,91,202,71,167,49,266,100,197,56,229,2,217,15,124,47,248,81,241,43,245,113,29,105,179,111,195,90,11,178,109,180,268,200,62,228,6,159,69,207,73,251,40,125,214,287,137,10,210,14,135,282,223,112,32,180,74,0,230,134,18,115,28,240,20,242,45,121,183,119,232,147,247,108,279,168,67,160,15,146,263,51,225,6,166,74,246,118,196,261,144,249,36,129,209,272,82,198,265,145,2,210,73,256,107,285,105,187,94,193,114,200,93,11,148,17,182,97,233,9,98,7,175,50,273,206,46,118,224,284,205,4,95,276,164,59,200,85,243,78,257,155,283,210,271,163,268,47,128,38,126,188,80,236,99,204,2,87,197,269,176,101,233,23,259,199,103,190,119,28,134,227,53,171,7,115,35,250,192,253,71,206,267,31,220,22,212,3,79,231,25,139,5,203,127,49,262,26,136,270,48,122,193,64,162,254,176,257,42,109,29,188,35,140,2,221,280,142,23,183,120,200,102,19,243,45,171,105,30,162,282,218,277,116,225,279,81,271,127,189,124,226,1,77,265,181,113,216,132,10,94,197,110,19,212,270,170,26,125,14,92,193,115,30,143,278,203,263,48,131,213,5,236,28,122,208,66,182,24,100,192,104,7,154,281,184,120,286,70,244,43,108,179,262,159,55,151,16,251,34,183,96,191,109,6,163,19,122,234,8,91,275,130,198,261,201,86,242,117,16,227,0,216,28,264,197,256,48,153,35,215,116,29,212,13,161,69,287,90,200,132,285,165,51,133,198,61,159,70,172,63,203,260,21,227,280,224,48,120,24,89,248,40,105,36,114,178,277,168,254,194,263,25,211,127,279,132,18,147,44,112,30,245,10,126,205,72,228,58,232,123,254,105,210,71,285,169,107,180,275,214,2,201,133,274,216,138,279,120,173,77,246,112,177,29,146,27,165,75,179,266,46,243,11,84,265,196,131,224,28,251,191,120,271,181,97,236,7,177,100,232,146,248,193,80,252,37,129,190,56,127,226,59,175,46,264,24,121,182,270,155,259,22,91,198,106,31,229,143,7,116,34,243,13,94,199,86,280,206,263,29,107,205,268,28,131,21,85,9,128,230,285,129,218,287,118,219,273,143,233,65,202,4,150,41,107,186,125,39,247,72,204,259,38,237,98,284,173,113,20,257,22,216,161,43,156,4,139,206,103,241,68,287,209,12,89,188,23,211,276,159,239,64,141,6,174,51,266,208,46,119,198,125,11,95,185,118,13,134,256,44,111,26,161,65,193,255,33,268,171,101,242,74,287,143,191,86,202,263,198,109,40,104,36,244,10,136,240,106,170,121,231,286,229,117,274,154,235,78,232,284,102,17,252,173,9,167,81,191,112,6,205,137,188,286,65,207,47,225,140,262,131,63,194,145,42,168,118,172,114,29,117,213,269,87,8,220,281,166,224,129,23,265,211,93,15,183,113,268,150,245,190,106,30,249,192,54,163,219,102,177,262,207,98,265,27,107,246,41,157,282,121,180,261,90,23,86,20,119,167,75,263,122,13,207,259,87,196,129,255,108,159,236,125,22,268,30,212,287,228,2,225,277,50,126,190,138,17,149,66,187,108,238,19,107,44,259,79,5,217,21,186,92,263,165,222,283,144,264,51,178,272,34,112,184,130,210,6,96,195,252,26,120,232,170,117,286,113,243,38,103,41,190,76,240,62,168,122,247,35,100,185,30,95,0,70,227,9,134,200,105,172,239,130,22,222,144,41,218,280,43,113,33,249,15,164,121,278,157,248,111,176,275,165,120,196,266,31,189,110,28,250,198,255,50,287,116,171,119,283,48,147,260,195,58,234,127,64,130,227,60,172,285,236,104,33,241,46,112,174,246,189,139,37,148,197,251,118,201,68,247,61,173,117,23,256,127,5,240,45,205,270,220,14,209,87,22,266,19,258,210,4,101,207,70,158,66,166,119,170,279,229,63,133,20,212,264,110,181,11,142,192,92,4,85,23,215,162,107,199,61,201,89,22,158,272,27,113,176,251,68,143,18,111,177,256,32,105,273,175,104,184,78,260,16,126,201,265,170,234,60,230,77,222,0,148,262,28,271,36,99,215,1,136,204,103,193,91,268,51,111,244,165,16,253,47,222,129,26,273,49,128,182,267,152,45,106,257,196,57,236,1,209,259,202,88,194,62,170,113,192,144,9,207,109,32,115,24,97,234,133,206,111,256,38,99,188,239,7,83,270,29,141,282,134,186,127,13,257,212,275,200,249,39,159,115,172,49,123,167,35,104,278,166,5,209,156,251,149,28,124,204,112,16,120,169,117,227,276,221,132,14,115,21,269,85,280,40,247,43,278,154,65,171,28,87,249,167,227,22,210,266,129,193,245,120,63,128,55,136,19,255,45,246,82,5,145,262,212,160,264,132,242,189,98,238,70,209,277,33,99,175,114,162,251,49,223,141,286,72,206,85,195,108,41,248,8,208,48,252,192,130,40,270,222,113,263,38,97,190,93,179,84,20,106,234,185,132,217,284,70,200,83,250,37,117,162,236,41,227,79,233,283,96,231,153,15,254,24,125,225,275,229,171,110,209,102,242,29,217,0,97,197,150,236,66,191,253,177,108,34,94,5,131,218,164,122,57,180,115,217,273,28,252,146,256,14,182,100,30,173,44,262,39,281,143,46,203,137,59,201,279,148,243,116,187,240,68,194,242,43,105,164,125,64,128,23,263,218,272,118,27,88,190,53,145,26,265,20,268,36,258,213,11,232,134,199,113,276,183,287,175,256,50,168,73,147,195,123,162,110,24,212,15,225,56,135,21,247,90,8,161,119,248,202,255,85,199,124,166,121,7,172,102,29,181,108,16,137,51,211,74,229,183,25,274,203,3,147,250,72,170,111,48,129,240,0,127,22,119,174,57,233,70,181,278,169,235,67,207,154,260,110,53,113,157,203,252,10,140,188,90,15,263,27,253,45,280,153,232,183,37,98,187,106,244,142,282,234,99,277,35,227,52,152,33,136,209,49,268,196,65,182,92,26,261,208,106,178,116,257,175,221,76,2,124,260,31,179,227,128,172,109,265,100,217,40,110,7,164,42,141,215,12,180,224,281,236,29,250,201,270,19,120,160,278,173,242,31,111,249,148,237,61,119,213,3,195,60,129,14,95,25,112,158,281,42,102,202,277,236,73,246,115,167,223,58,171,130,220,44,204,262,114,31,247,172,122,169,6,86,198,56,124,165,221,139,13,159,40,250,11,217,264,21,267,52,140,5,201,107,50,275,100,19,131,252,46,115,197,89,26,153,198,148,196,270,35,93,173,25,261,213,256,139,31,92,180,234,3,219,259,119,197,108,172,16,187,120,236,39,152,99,231,157,211,103,176,220,104,28,212,73,179,269,18,270,90,206,123,65,188,34,259,114,61,194,80,226,48,2,235,46,279,82,268,204,249,79,224,267,26,237,133,0,149,221,10,175,125,35,111,165,127,194,105,274,230,72,16,94,264,29,86,245,0,190,143,260,43,158,235,95,232,186,67,283,99,185,271,102,167,257,48,124,161,55,197,262,24,266,113,155,17,175,105,206,247,188,111,239,49,109,251,134,184,9,253,37,232,285,41,94,1,147,69,242,191,40,151,111,175,74,278,53,108,166,212,259,156,115,281,205,248,34,256,215,161,242,3,90,10,206,99,181,81,190,238,63,167,279,208,141,20,249,152,14,138,52,124,264,210,88,33,109,159,125,46,240,13,66,250,107,153,272,96,200,80,7,146,19,129,172,214,32,175,247,287,140,30,227,5,165,50,6,47,99,136,66,286,109,182,85,267,209,29,257,129,232,55,115,173,126,25,86,207,48,272,176,89,184,236,118,189,44,100,32,278,27,260,72,254,8,144,4,199,151,280,183,70,205,95,213,277,222,56,181,226,154,266,93,25,119,18,267,101,190,33,220,256,149,113,178,104,13,201,141,191,87,34,273,231,188,102,161,45,283,202,253,31,239,163,59,173,107,10,115,248,48,9,217,73,252,184,275,236,70,141,234,36,169,130,283,136,87,211,12,124,163,221,255,41,105,21,112,252,85,178,230,145,279,31,107,239,174,108,38,157,111,269,160,205,102,44,208,71,225,128,163,109,237,286,131,66,15,271,17,89,32,238,10,182,224,50,179,103,233,14,102,184,31,90,194,116,165,211,67,144,280,131,171,124,252,39,217,169,230,98,1,49,104,42,127,229,51,161,259,29,232,62,121,172,263,20,253,138,226,118,269,23,98,196,149,271,220,258,125,6,257,105,159,213,248,165,42,92,207,272,106,253,169,286,83,192,36,254,116,155,22,214,75,182,221,37,122,175,129,162,273,15,185,233,54,186,243,285,248,23,275,86,261,219,17,109,26,240,66,218,71,262,99,198,81,2,142,44,230,156,265,177,128,85,272,16,129,212,96,154,117,54,164,21,88,274,199,251,126,23,71,18,77,225,180,82,196,111,201,269,48,229,179,63,241,4,135,246,210,168,113,5,155,52,148,46,97,169,132,64,153,282,187,35,98,239,9,259,195,100,175,12,105,150,270,17,95,180,263,119,181,91,1,243,27,211,286,179,112,194,253,172,29,269,231,31,226,52,166,247,88,187,125,160,104,140,217,173,235,42,171,76,244,46,169,135,0,51,212,119,153,256,192,236,34,124,89,205,251,196,60,201,103,165,225,59,275,112,227,270,82,228,267,55,282,145,108,222,32,266,183,101,29,246,207,68,157,13,97,47,4,257,25,268,125,83,169,115,164,259,75,188,79,133,168,37,189,52,269,20,135,265,118,207,46,7,222,254,50,1,146,277,176,98,201,256,26,84,273,23,278,78,178,28,97,202,94,276,22,262,162,116,57,235,123,271,188,224,114,148,67,228,184,128,158,110,58,160,279,219,183,16,181,104,240,40,95,273,152,264,205,245,36,161,63,255,163,42,135,101,169,123,25,247,198,58,139,265,162,204,143,90,253,223,181,35,257,219,45,150,16,236,155,103,50,283,64,230,57,5,40,2,71,231,37,170,209,69,129,82,173,8,180,227,185,21,279,77,233,124,153,243,277,88,128,174,241,101,218,286,111,217,64,159,96,203,72,0,207,242,170,256,40,167,134,284,36,184,75,196,62,115,176,47,131,160,27,234,48,177,19,190,255,95,260,214,3,140,251,98,45,13,275,14,213,271,18,210,66,178,130,161,4,237,116,44,245,284,180,129,249,105,139,38,120,152,65,176,74,216,255,28,166,209,50,118,20,259,174,95,265,19,144,109,193,107,46,204,273,17,121,283,54,198,70,3,260,149,50,249,197,59,108,183,60,165,86,248,203,1,126,163,106,39,102,266,35,224,125,192,114,214,268,88,176,209,20,193,262,218,36,264,116,231,168,82,202,144,30,179,232,15,259,166,273,240,29,93,43,176,255,78,227,283,249,46,201,156,112,172,127,30,85,185,32,134,90,213,145,64,257,97,2,31,271,26,104,171,244,206,129,75,251,217,54,143,283,20,280,52,112,8,44,120,260,201,33,262,72,256,184,0,59,190,220,46,172,67,135,188,56,16,136,187,73,287,199,244,102,175,141,246,204,38,159,126,55,137,278,230,27,267,71";
}

function example3(){
    pinsOutput.value = "0,150,284,147,281,146,279,145,278,144,276,143,280,148,286,152,2,151,285,149,287,153,3,154,4,156,6,155,1,150,283,145,277,141,278,142,274,90,244,68,242,57,238,56,237,58,240,59,241,72,243,66,239,67,245,86,246,81,236,55,234,54,215,71,244,79,242,74,240,57,237,80,243,65,241,58,239,56,235,75,245,70,247,87,246,78,254,71,217,72,240,88,244,83,242,77,261,80,262,76,243,85,241,57,236,56,234,81,238,58,235,73,256,78,260,79,253,70,246,66,248,84,245,91,244,76,223,55,237,82,242,81,264,77,254,69,213,54,211,68,214,72,216,73,245,90,246,65,244,80,239,57,235,82,238,55,220,71,241,56,231,58,236,86,237,83,263,78,243,67,250,70,218,72,246,69,242,85,238,79,258,74,244,75,222,55,240,56,233,82,245,78,225,77,253,68,247,65,249,71,213,67,251,69,211,53,206,54,218,74,246,89,239,78,262,81,243,90,242,87,236,88,248,80,257,72,219,56,230,55,217,68,246,71,240,77,263,76,241,73,214,54,209,67,247,173,86,239,84,243,70,249,175,252,66,244,62,206,65,251,176,89,238,78,223,74,259,79,228,80,236,75,243,68,252,178,254,67,212,55,221,77,265,82,247,78,261,74,248,172,85,171,83,246,173,87,238,80,256,177,250,68,215,70,241,55,224,79,243,57,234,165,232,82,266,77,257,84,173,251,179,253,78,265,86,174,88,237,81,255,176,256,70,211,56,209,89,243,62,241,83,236,167,80,240,79,252,76,259,71,248,65,238,86,234,72,213,90,214,53,204,55,231,164,233,87,172,81,235,89,247,75,260,73,255,78,227,71,238,169,51,171,84,175,88,268,87,206,63,245,79,226,55,239,168,235,85,244,92,247,174,250,64,213,91,243,77,258,69,216,67,218,57,221,76,264,79,166,231,163,229,56,242,59,238,84,170,245,77,248,177,88,208,89,174,83,243,87,176,253,181,255,76,266,79,241,66,249,81,224,56,220,77,251,68,212,91,238,167,240,89,211,71,214,57,208,94,213,73,262,83,172,80,263,81,245,69,210,88,205,54,225,160,74,216,90,239,170,85,199,53,236,84,227,161,77,268,136,271,137,270,138,273,140,275,144,280,146,277,142,279,148,283,151,1,152,284,145,281,149,0,147,285,150,287,154,219,20,220,54,232,168,237,171,245,66,253,180,256,178,259,187,260,179,250,65,254,182,252,173,51,170,80,166,233,55,216,70,240,66,247,88,172,52,194,84,177,89,175,246,76,267,86,204,83,239,77,259,70,244,82,169,85,234,170,236,78,165,230,81,200,58,203,62,248,68,219,22,220,26,221,66,250,80,190,87,178,51,174,254,185,258,179,255,77,244,69,247,81,196,83,176,88,235,84,192,79,171,242,55,219,70,236,54,237,166,239,82,184,261,76,269,86,210,90,215,57,217,18,218,75,265,195,264,87,177,253,65,252,179,83,211,85,231,168,51,176,90,207,89,173,88,241,78,258,76,260,186,257,177,86,201,57,244,81,240,68,220,53,209,94,183,56,222,29,221,157,223,36,224,161,74,262,75,159,225,55,235,79,251,64,211,88,192,120,191,81,268,198,82,236,52,169,86,179,248,78,219,67,244,89,178,261,72,212,85,202,53,238,83,168,230,162,226,80,270,139,275,145,280,147,282,143,273,144,283,146,286,151,284,149,279,85,184,79,218,17,217,70,214,84,195,263,73,244,78,257,67,249,180,82,197,269,75,240,172,89,189,108,188,258,176,254,79,164,235,90,204,78,193,52,167,233,58,218,69,239,173,85,189,81,223,37,224,75,249,68,256,65,208,84,182,93,180,250,184,101,185,78,229,55,232,87,174,244,86,248,171,88,209,81,241,54,173,79,271,138,272,76,256,186,103,222,25,221,156,71,235,86,206,94,216,75,259,68,245,80,163,234,171,249,79,255,70,212,81,202,90,196,124,195,122,194,266,73,217,19,220,27,221,53,233,79,247,172,86,178,56,228,164,76,265,183,82,206,90,217,54,207,85,236,67,252,78,214,63,249,73,158,220,58,215,151,282,145,287,148,2,103,184,260,74,241,90,177,91,234,166,240,82,186,255,65,245,76,268,133,55,199,271,77,237,84,228,162,78,206,93,204,88,191,121,194,82,243,69,223,32,221,24,222,155,218,53,208,62,246,174,85,193,123,196,262,77,230,167,84,203,94,181,55,197,90,236,165,83,209,71,158,222,79,213,66,251,63,217,21,220,104,185,100,282,148,278,146,276,140,51,179,261,182,253,76,257,65,205,80,208,87,200,86,180,254,81,211,58,242,54,231,161,236,79,239,76,248,83,170,88,178,94,214,64,216,13,201,85,227,43,228,166,78,267,198,81,195,262,70,242,65,210,84,244,177,56,216,76,273,137,269,79,227,164,77,170,87,188,106,187,89,191,112,190,83,235,169,245,57,213,149,5,153,4,88,207,80,220,63,248,180,94,196,268,85,209,79,256,179,262,71,239,54,238,76,270,78,215,74,219,57,224,38,113,184,252,183,96,212,83,228,160,75,258,72,265,198,130,51,126,194,119,192,81,213,70,210,87,175,90,199,273,142,281,206,283,143,275,86,203,89,267,82,205,84,181,92,238,77,249,69,241,75,217,152,215,15,218,55,227,70,265,194,124,52,119,190,110,186,102,287,146,285,101,222,31,214,16,217,59,210,72,193,86,183,263,69,215,150,280,85,197,79,188,259,67,246,77,213,82,176,241,53,222,34,217,28,220,160,224,163,81,187,116,185,99,209,64,247,73,257,175,256,77,272,141,51,120,52,129,50,144,284,78,237,174,90,195,127,10,199,79,214,55,128,197,261,98,185,251,81,204,85,166,241,172,82,182,243,56,226,41,229,80,235,173,90,190,258,68,216,32,224,77,252,63,250,176,86,170,89,233,171,230,54,240,169,242,53,219,24,123,191,82,201,269,80,255,97,214,151,7,157,71,260,67,208,79,161,222,22,122,192,90,200,9,126,56,180,85,239,70,267,132,199,270,184,105,187,274,141,202,84,233,80,217,58,212,87,179,235,78,242,76,275,79,223,23,114,185,102,211,82,187,113,40,129,13,215,11,198,94,179,257,191,115,184,84,213,65,258,71,245,168,236,77,286,147,3,85,196,270,135,57,198,272,78,240,53,118,193,263,72,244,182,51,145,50,139,274,144,205,79,220,23,201,88,169,230,78,282,207,84,200,89,7,194,93,192,125,51,121,30,217,155,231,49,235,87,171,238,90,188,254,74,256,184,107,28,222,156,5,85,176,56,205,64,186,117,26,218,14,108,31,210,0,153,283,147,277,206,279,98,212,71,264,199,131,51,143,284,77,241,84,216,54,174,91,12,127,50,146,210,148,214,81,203,87,230,159,226,35,220,18,111,189,252,80,194,90,172,236,163,82,248,104,183,267,72,155,219,64,215,36,218,24,114,192,87,202,274,77,247,84,269,187,272,89,196,75,273,82,208,100,186,115,52,234,181,264,130,57,222,21,221,81,0,77,215,29,105,188,263,75,257,193,94,176,230,173,53,122,55,213,2,154,221,109,190,66,254,76,250,171,227,34,111,185,118,27,117,51,124,6,152,218,104,30,220,16,109,36,108,252,90,191,5,157,234,175,251,74,243,166,51,142,69,257,101,210,81,239,47,214,67,139,70,252,188,112,184,93,177,249,99,220,57,204,27,223,52,242,170,240,182,55,178,82,203,90,179,236,48,128,11,85,198,137,70,266,131,42,232,81,276,138,196,129,199,263,68,135,197,125,7,155,67,211,286,78,212,152,80,242,97,285,208,86,195,79,281,150,8,88,10,154,232,175,239,87,168,243,64,217,69,252,82,216,19,95,184,116,189,90,208,56,223,39,211,149,282,190,107,187,254,63,218,31,103,20,121,185,260,68,255,193,266,198,86,175,52,232,183,114,54,228,169,234,88,190,6,89,180,233,185,109,29,220,25,124,34,110,214,76,210,83,186,86,9,201,141,280,204,80,225,24,200,98,276,187,127,52,181,229,46,238,162,237,85,205,77,283,78,1,146,203,83,256,194,133,192,111,52,196,96,253,67,261,79,201,265,130,14,131,268,188,273,136,267,197,259,73,145,77,3,150,217,76,278,92,178,234,78,208,106,185,84,254,80,271,75,219,58,214,156,8,125,187,90,198,141,67,258,177,95,197,70,248,79,280,149,78,226,54,221,20,94,202,264,185,113,51,119,53,234,48,122,197,32,215,100,201,272,204,59,214,69,236,166,86,171,81,199,88,273,185,231,39,109,191,85,247,80,211,4,77,2,214,65,259,78,221,163,241,67,138,269,134,192,10,217,15,199,133,43,123,195,97,277,143,279,84,209,72,221,58,172,239,59,218,158,236,45,232,186,112,215,81,286,192,126,10,86,168,82,193,125,26,224,116,183,102,219,94,207,64,203,140,277,85,218,13,130,52,112,19,201,267,181,233,37,107,51,147,212,281,76,285,148,4,214,17,221,56,225,172,55,210,93,175,254,194,73,258,80,200,143,196,136,22,216,63,188,129,54,233,170,56,244,87,167,235,51,241,168,53,123,32,111,194,259,189,120,184,114,40,237,165,240,84,197,57,206,35,108,50,138,74,213,33,110,187,103,211,276,147,79,287,191,78,274,184,234,180,91,214,154,9,158,7,197,93,246,82,231,187,101,24,205,278,139,201,28,226,171,236,169,84,12,107,209,284,100,212,79,265,68,137,272,133,19,88,239,94,189,241,82,199,56,117,183,115,25,204,101,283,149,2,89,193,112,185,227,27,216,33,114,186,105,249,62,245,167,82,278,209,38,106,210,64,212,157,70,134,68,152,207,145,285,77,6,214,83,224,54,201,262,192,267,185,124,56,246,80,283,95,25,227,44,136,46,236,38,128,186,239,91,211,29,219,54,146,198,126,53,225,175,228,182,268,79,207,283,152,281,187,85,194,68,224,106,51,177,238,159,69,208,96,180,237,89,253,191,71,133,201,76,287,213,9,149,204,269,78,250,86,242,73,265,135,67,263,74,142,197,83,245,58,216,62,214,101,186,111,211,76,251,71,145,0,151,203,36,234,189,109,49,127,9,202,88,14,82,262,79,143,206,84,242,185,115,22,224,58,248,169,239,46,135,192,131,197,264,67,256,81,278,212,75,163,51,112,41,202,33,219,109,210,281,78,3,155,12,197,147,279,74,144,67,217,98,205,145,274,207,101,36,126,186,226,118,49,220,24,137,51,172,233,190,93,199,261,70,269,140,271,196,84,165,243,175,259,102,34,214,75,206,29,224,82,171,54,108,190,276,135,21,120,28,230,188,104,1,215,89,205,153,11,200,127,193,29,119,184,266,196,116,53,216,71,247,76,143,47,235,171,231,50,148,212,94,245,85,230,180,87,217,7,78,172,221,23,123,57,202,5,77,8,159,10,106,26,219,12,130,50,114,195,139,272,209,151,280,99,0,117,185,278,187,118,25,196,88,167,242,102,202,262,67,248,81,208,143,271,90,251,184,228,31,96,193,53,111,187,109,54,135,266,202,78,133,18,216,79,2,194,98,32,114,222,19,120,40,208,31,131,217,50,167,239,75,256,188,83,277,101,255,175,91,246,192,136,200,273,85,15,209,157,68,254,179,265,67,142,275,89,213,108,223,117,194,29,216,59,187,123,185,81,225,186,250,82,222,71,281,86,211,44,218,48,119,227,42,237,169,87,183,271,134,196,20,159,221,22,135,71,268,75,252,73,133,193,9,220,69,248,91,235,76,203,263,128,267,195,144,198,8,89,269,74,148,199,138,41,104,247,90,212,112,181,106,216,153,284,79,230,48,214,279,72,215,287,144,0,154,84,199,280,95,211,2,122,186,237,87,12,217,56,200,130,187,94,224,112,55,169,233,174,57,246,191,52,142,283,103,189,284,196,120,56,149,209,28,221,38,101,1,77,141,276,82,204,13,154,218,71,257,68,192,106,214,283,79,15,201,83,247,179,231,34,97,210,271,86,13,195,89,185,108,217,159,211,49,146,52,212,0,79,137,62,252,107,55,175,94,215,282,81,260,65,218,40,225,187,121,4,203,275,212,155,234,153,202,54,125,69,136,277,148,5,199,151,81,218,46,142,272,206,99,195,17,110,37,210,156,72,160,226,23,212,285,73,220,47,125,199,118,51,105,203,53,117,191,134,55,113,22,86,188,275,200,77,9,124,201,58,116,31,233,187,104,27,229,53,237,41,224,73,199,100,279,150,6,79,168,244,165,88,254,82,215,60,205,35,225,25,139,197,87,251,109,183,119,263,198,259,180,53,170,214,85,168,216,89,201,4,217,14,158,227,188,68,140,27,86,229,81,269,129,197,115,221,42,204,65,209,145,286,149,83,207,72,256,174,92,245,61,217,45,206,88,182,264,80,280,215,132,74,284,146,196,149,214,29,128,52,171,50,123,3,89,241,95,200,35,104,215,10,78,4,189,107,222,26,229,155,5,90,193,122,31,201,156,11,191,273,70,228,87,270,73,210,46,120,69,275,80,162,203,56,145,1,197,119,186,127,185,265,125,196,98,278,101,239,52,215,284,213,99,182,110,54,235,184,276,79,19,161,17,132,218,27,197,80,153,68,241,171,246,84,262,203,21,91,176,227,181,113,52,243,58,255,87,26,119,284,207,276,145,194,287,80,136,51,164,88,245,98,282,141,50,147,275,209,55,108,192,138,203,14,193,33,228,152,10,129,15,221,70,187,223,105,53,120,225,58,232,44,113,262,103,41,212,19,219,36,125,186,230,153,1,148,281,216,130,254,106,24,96,205,151,213,86,278,72,141,194,269,132,195,5,125,50,142,202,75,170,251,95,33,232,191,113,221,80,17,97,204,266,134,200,54,227,154,206,81,257,82,143,45,126,12,79,273,205,280,102,212,49,137,40,234,179,56,118,190,63,187,114,277,144,211,279,70,192,30,232,184,259,80,267,133,57,111,183,85,256,199,155,0,189,226,43,236,174,258,96,18,213,44,220,114,181,269,208,71,128,272,94,248,170,238,157,224,52,198,112,274,81,140,28,126,185,257,117,17,159,201,93,188,110,284,80,249,89,26,202,271,129,212,160,8,152,12,214,105,182,234,50,225,104,53,210,110,52,101,196,10,97,198,2,118,184,55,136,81,13,78,209,286,99,281,193,56,106,272,83,253,178,238,175,211,24,85,4,161,21,121,50,133,69,276,139,266,207,155,84,190,132,202,278,78,15,108,211,166,245,164,83,226,183,90,186,130,270,207,87,11,127,261,198,117,34,234,187,52,218,8,149,231,80,5,216,283,188,224,110,195,53,166,44,239,125,56,119,55,147,2,218,38,204,51,232,32,165,74,211,150,230,53,144,199,78,130,70,281,139,268,92,241,94,23,136,191,231,64,254,58,118,282,71,143,30,95,237,179,97,262,121,39,115,54,126,8,206,36,227,82,259,72,124,186,71,270,203,157,3,152,204,103,282,213,274,137,279,197,9,151,57,180,236,156,20,113,4,147,200,160,11,194,6,163,240,174,94,34,207,95,5,87,272,196,29,213,114,43,138,215,7,77,287,98,14,220,153,85,224,33,122,203,52,149,69,161,217,88,252,100,263,82,281,199,258,99,193,230,195,142,280,138,190,58,251,107,212,277,79,18,158,203,91,216,279,151,226,75,124,24,116,192,123,264,112,31,130,252,197,145,67,242,89,0,215,26,138,70,117,66,222,52,211,146,275,198,19,134,36,107,194,135,201,127,248,64,257,94,139,42,214,20,160,16,84,256,103,224,149,1,122,227,39,105,57,181,100,14,162,70,209,90,266,180,241,184,17,78,132,253,87,267,114,51,150,83,268,179,243,169,231,46,95,274,203,7,205,264,129,79,285,140,199,0,55,247,99,28,89,17,197,3,191,23,82,195,148,206,133,37,168,240,196,69,122,244,201,287,218,49,172,54,131,15,118,260,183,257,134,262,177,254,85,284,94,11,125,71,266,89,220,181,108,261,188,126,209,51,180,111,36,204,16,216,275,70,135,256,118,160,199,21,183,58,170,250,100,67,154,213,3,217,66,155,204,10,157,6,59,280,89,270,142,93,149,114,282,152,51,71,154,14,78,287,206,104,249,188,277,214,132,94,226,157,200,39,236,191,224,164,239,49,95,44,160,3,104,7,187,4,107,180,229,35,216,51,128,58,178,90,249,174,257,109,142,45,167,54,176,53,73,137,193,275,92,259,136,93,122,66,97,186,214,145,33,105,0,219,86,262,104,51,162,2,192,283,211,13,106,21,158,120,5,212,26,185,80,265,74,277,133,205,139,170,81,8,59,27,210,176,221,106,151,11,189,253,75,52,178,91,250,110,153,122,270,200,7,57,150,79,232,142,80,16,119,188,31,166,12,191,242,127,13,132,53,186,36,95,57,223,18,219,15,153,210,164,19,206,44,121,287,73,119,264,194,227,135,81,161,5,82,272,70,156,286,218,1,190,243,198,25,87,248,202,159,233,41,217,111,229,29,187,128,245,103,68,143,107,54,196,33,164,131,186,276,56,112,67,150,203,100,70,169,217,82,251,198,158,5,108,148,227,53,285,187,22,197,238,68,116,26,100,275,131,254,72,120,186,109,213,56,196,256,3,119,148,84,265,132,57,170,215,276,91,16,130,41,163,25,136,228,47,144,279,184,64,249,172,244,104,22,157,56,282,109,265,186,9,106,250,201,45,194,115,34,221,142,267,210,285,59,28,111,259,97,53,74,51,167,39,88,271,26,226,134,270,85,14,94,122,4,264,138,168,46,235,153,286,260,195,228,173,13,155,115,188,98,269,59,23,88,67,99,184,110,141,268,189,248,124,238,192,241,47,159,53,197,105,19,188,267,75,250,93,15,273,130,97,239,199,247,168,222,61,205,115,94,262,190,9,163,112,0,257,86,233,73,253,59,38,165,139,283,54,124,152,58,161,232,188,286,83,166,128,201";
}

function onOpenCvReady(): void {
    // even when this is called, sometimes it's still not ready, adding slight time buffer
 
    numberOfPins.value = N_PINS.toString();
    numberOfPins.addEventListener("keyup", function(event: Event): void {
        N_PINS = parseInt((event.target as HTMLInputElement).value);
    });

    numberOfLines.value = MAX_LINES.toString();
    numberOfLines.addEventListener("keyup", function(event: Event): void {
        MAX_LINES = parseInt((event.target as HTMLInputElement).value);
    });

    lineWeight.value = LINE_WEIGHT.toString();
    lineWeight.addEventListener("keyup", function(event: Event): void {
        LINE_WEIGHT = parseInt((event.target as HTMLInputElement).value);
    });
}